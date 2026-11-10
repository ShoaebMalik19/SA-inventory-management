import "server-only";
import type { Q } from "./db";
import { activityByIds, batchesByIds, machinesByIds, type Patch } from "./repo";
import { invoicesByIds } from "./billing";
import { activity, event, lockMachine, UserError } from "./service";
import { can } from "@/lib/roles";
import { financialYear } from "@/lib/gst";
import type { Condition, Grade, MachineType, Staff } from "@/lib/data/types";

/**
 * Fixing mistakes. Every fix is written to the machine's history and to the shop's activity log
 * with exactly what changed, so the owner can always see who changed what.
 */

const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export type MachineEdit = {
  id: string;
  serial?: string;
  type?: MachineType;
  brand?: string;
  model?: string;
  cpu?: string;
  gen?: number;
  ram?: number;
  storage?: number;
  storageType?: "SSD" | "HDD";
  screen?: number | null;
  condition?: Condition;
  battery?: number | null;
  grade?: Grade;
  cost?: number;
  price?: number;
  reason?: string;
};

const FIELDS: { key: keyof MachineEdit; col: string; label: string; fmt?: (v: unknown) => string; money?: boolean }[] = [
  { key: "serial", col: "serial", label: "Serial" },
  { key: "type", col: "type", label: "Type" },
  { key: "brand", col: "brand", label: "Brand" },
  { key: "model", col: "model", label: "Model" },
  { key: "cpu", col: "cpu", label: "Processor" },
  { key: "gen", col: "gen", label: "Generation", fmt: (v) => `${v}th gen` },
  { key: "ram", col: "ram", label: "RAM", fmt: (v) => `${v} GB` },
  { key: "storage", col: "storage", label: "Storage", fmt: (v) => `${v} GB` },
  { key: "storageType", col: "storage_type", label: "Storage type" },
  { key: "screen", col: "screen", label: "Screen", fmt: (v) => (v ? `${v}"` : "none") },
  { key: "condition", col: "condition", label: "Condition" },
  { key: "battery", col: "battery", label: "Battery", fmt: (v) => (v === null || v === undefined ? "not checked" : `${v}%`) },
  { key: "grade", col: "grade", label: "Grade" },
  { key: "cost", col: "cost", label: "Bought for", fmt: (v) => rs(Number(v)), money: true },
  { key: "price", col: "price", label: "Asking price", fmt: (v) => rs(Number(v)), money: true },
];

export async function editMachine(q: Q, by: Staff, e: MachineEdit): Promise<Patch> {
  const m = await lockMachine(q, e.id);
  if (m.stage === "sold") throw new UserError("This machine is sold. Record a return or cancel the sale first.");
  const money = can(by.role, "viewMoney");

  if (e.serial !== undefined) {
    e.serial = e.serial.trim().toUpperCase();
    if (!e.serial) throw new UserError("The serial number can't be empty.");
    const dup = await q.query("select 1 from machines where upper(serial) = $1 and id <> $2", [e.serial, e.id]);
    if (dup.length) throw new UserError(`Another machine already has serial ${e.serial}.`);
  }
  for (const k of ["brand", "model", "cpu"] as const) if (e[k] !== undefined && !String(e[k]).trim()) throw new UserError("Brand, model and processor can't be empty.");
  if (e.gen !== undefined && !(e.gen >= 1 && e.gen <= 20)) throw new UserError("Generation should be between 1 and 20.");
  if (e.ram !== undefined && !(e.ram >= 1 && e.ram <= 256)) throw new UserError("Check the RAM size.");
  if (e.storage !== undefined && !(e.storage >= 16 && e.storage <= 8192)) throw new UserError("Check the storage size.");
  if (e.battery !== undefined && e.battery !== null && !(e.battery >= 0 && e.battery <= 100)) throw new UserError("Battery health is a % from 0 to 100.");
  if (e.grade !== undefined && m.stage !== "ready" && m.stage !== "booked") throw new UserError("Only checked machines have a grade.");
  if (e.price !== undefined && m.stage !== "ready") throw new UserError("Only ready machines have an asking price.");
  if (e.price !== undefined && !(e.price > 0)) throw new UserError("Enter a price above zero.");
  if (e.cost !== undefined && !(e.cost >= 0)) throw new UserError("Enter what you paid for it.");

  const sets: string[] = [];
  const args: unknown[] = [e.id];
  const changes: string[] = [];
  for (const f of FIELDS) {
    let v = e[f.key];
    if (v === undefined) continue;
    if (f.money && !money) continue; // technicians can't see or change money
    if (typeof v === "string") v = v.trim();
    if (f.key === "cost" || f.key === "price") v = Math.round(Number(v));
    const old = m[f.col];
    const same = old === null || old === undefined ? v === null || v === undefined : String(old) === String(v);
    if (same) continue;
    args.push(v);
    sets.push(`${f.col}=$${args.length}`);
    const show = f.fmt ?? ((x: unknown) => String(x ?? "—"));
    changes.push(`${f.label} ${show(old)} → ${show(v)}`);
  }
  if (!changes.length) throw new UserError("Nothing was changed.");
  await q.query(`update machines set ${sets.join(", ")}, updated_at=now() where id=$1`, args);
  const detail = changes.join(" · ") + (e.reason?.trim() ? ` (why: ${e.reason.trim()})` : "");
  await event(q, e.id, `Details corrected: ${detail}`, "edited", by);
  const act = await activity(q, `Corrected ${m.brand} ${m.model} (${m.serial})`, "fix", by, detail);
  return { machines: await machinesByIds(q, [e.id]), activity: await activityByIds(q, [act]) };
}

/** Put a checked machine back in the "waiting for check" queue — for a wrong grade or a mis-tap. */
export async function undoCheck(q: Q, by: Staff, a: { id: string }): Promise<Patch> {
  const m = await lockMachine(q, a.id);
  if (m.stage === "checking") throw new UserError("This machine is already waiting for check.");
  if (m.stage === "sold") throw new UserError("This machine is sold. Record a return instead.");
  if (m.stage === "booked") throw new UserError("This machine is booked for a big order. Cancel the order first.");
  if (!can(by.role, "viewMoney")) {
    const last = (await q.query<{ at: string; by_name: string }>(
      "select at, by_name from machine_events where machine_id=$1 and kind in ('checked','repair') order by at desc limit 1",
      [a.id],
    ))[0];
    const mins = last ? (Date.now() - new Date(last.at).getTime()) / 60000 : Infinity;
    if (mins > 30) throw new UserError("You can undo a check for 30 minutes. After that, ask the owner or manager.");
  }
  const was = m.stage === "ready" ? `ready, Grade ${m.grade}` : m.stage === "repair" ? "in repair" : "scrap";
  await q.query(
    "update machines set stage='checking', grade=null, price=0, wiped=false, failed_checks=null, battery=null, updated_at=now() where id=$1",
    [a.id],
  );
  await event(q, a.id, `Check undone (was ${was}) — back to waiting for check`, "undone", by);
  const act = await activity(q, `Undid the check on ${m.brand} ${m.model} (${m.serial})`, "fix", by, `Was ${was}; now waiting for check again`);
  return { machines: await machinesByIds(q, [a.id]), activity: await activityByIds(q, [act]) };
}

/** Cancel a shop sale entered by mistake. The bill keeps its number and gets a credit note, as GST requires. */
export async function cancelSale(q: Q, by: Staff, a: { invoiceId: string; reason: string }): Promise<Patch> {
  if (!a.reason.trim()) throw new UserError("Write why the sale is being cancelled.");
  const inv = (await q.query<Record<string, unknown>>("select * from invoices where id=$1 for update", [a.invoiceId]))[0];
  if (!inv) throw new UserError("This bill doesn't exist any more.");
  if (inv.cancelled_at) throw new UserError(`Already cancelled (credit note ${inv.credit_note}).`);
  if (inv.kind !== "shop") throw new UserError("Only shop sales can be cancelled here. For a big order, record returns for the machines.");
  const sale = (await q.query<Record<string, unknown>>("select * from sales where id=$1", [inv.ref_id]))[0];
  if (!sale) throw new UserError("The sale for this bill is missing.");
  const m = await lockMachine(q, sale.machine_id as string);
  if (m.stage !== "sold") throw new UserError("This machine is no longer sold (it may have been returned). Nothing to cancel.");

  const fy = financialYear(new Date());
  const counter = await q.query<{ n: number }>(
    "insert into invoice_counters (fy, n) values ($1, 1) on conflict (fy) do update set n = invoice_counters.n + 1 returning n",
    [`CN ${fy}`],
  );
  const cn = `CN/${fy}/${String(counter[0].n).padStart(4, "0")}`;
  await q.query("update invoices set cancelled_at=now(), cancel_reason=$2, credit_note=$3 where id=$1", [a.invoiceId, a.reason.trim(), cn]);
  await q.query("delete from sales where id=$1", [sale.id]);
  await q.query("update machines set stage='ready', sold_price=null, sold_to=null, updated_at=now() where id=$1", [m.id]);
  await event(q, m.id as string, `Sale ${sale.code} cancelled (${a.reason.trim()}) — credit note ${cn}, back in ready stock`, "undone", by);
  const act = await activity(
    q,
    `Cancelled shop sale ${sale.code}: ${m.brand} ${m.model} to ${sale.customer}`,
    "fix",
    by,
    `Bill ${inv.number} cancelled with credit note ${cn} for ${rs(Number(inv.total))}. Why: ${a.reason.trim()}. Refund ${rs(Number(inv.total))} to the customer.`,
  );
  return {
    invoices: await invoicesByIds(q, [a.invoiceId]),
    machines: await machinesByIds(q, [m.id as string]),
    activity: await activityByIds(q, [act]),
    removed: { sales: [sale.id as string] },
  };
}

/** Remove a whole batch that was added by mistake — only while none of its machines have been touched. */
export async function removeBatch(q: Q, by: Staff, a: { batchId: string; reason: string }): Promise<Patch> {
  if (!a.reason.trim()) throw new UserError("Write why this batch is being removed.");
  const [b] = await batchesByIds(q, [a.batchId]);
  if (!b) throw new UserError("This batch doesn't exist any more.");
  const ms = await q.query<{ id: string; stage: string }>("select id, stage from machines where batch_id=$1 for update", [a.batchId]);
  const touched = ms.filter((m) => m.stage !== "checking").length;
  if (touched) throw new UserError(`${touched} machine${touched > 1 ? "s" : ""} from this batch were already checked or sold, so it can't be removed. Correct the machines one by one instead.`);
  const ids = ms.map((m) => m.id);
  const used = await q.query(
    `select 1 from machine_events where machine_id = any($1) and kind not in ('added','moved') limit 1`,
    [ids],
  );
  if (used.length) throw new UserError("Some machines in this batch already have work recorded on them, so it can't be removed.");
  const pays = await q.query<{ id: string; amount: string }>("select id, amount from supplier_payments where batch_id=$1", [a.batchId]);
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  await q.query("delete from machine_events where machine_id = any($1)", [ids]);
  await q.query("delete from machines where batch_id=$1", [a.batchId]);
  await q.query("delete from supplier_payments where batch_id=$1", [a.batchId]);
  await q.query("delete from batches where id=$1", [a.batchId]);
  const act = await activity(
    q,
    `Removed batch ${b.code} from ${b.supplier} (${ids.length} machines) — added by mistake`,
    "fix",
    by,
    `Bill ${b.billNo ?? "—"}, ${rs(b.totalCost)}${paid ? `, ${rs(paid)} payment record removed` : ""}. Why: ${a.reason.trim()}`,
  );
  return {
    activity: await activityByIds(q, [act]),
    removed: { machines: ids, batches: [a.batchId], supplierPayments: pays.map((p) => p.id) },
  };
}
