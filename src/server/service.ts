import "server-only";
import { randomBytes } from "node:crypto";
import type { Q } from "./db";
import {
  activityByIds,
  batchesByIds,
  machinesByIds,
  ordersByIds,
  returnsByIds,
  salesByIds,
  staffList,
  type Patch,
} from "./repo";
import { askingPrice } from "@/lib/data/seed";
import { can } from "@/lib/roles";
import { pickForRequirement } from "@/lib/data/selectors";
import type {
  Activity,
  Grade,
  HistoryEvent,
  Location,
  MachineType,
  Requirement,
  Role,
  Staff,
  SupplierType,
} from "@/lib/data/types";
import { hashPin } from "./pin";
import { insertMany } from "./seed-db";
import {
  addPayment,
  buyerByName,
  createInvoice,
  getSettings,
  invoicesByIds,
  listBuyers,
  machinesForInvoice,
  paymentsFor,
  putSettings,
  upsertBuyer,
} from "./billing";
import type { BusinessSettings, PaymentMode } from "@/lib/data/types";
import { PAYMENT_MODES } from "@/lib/data/types";
import { STATES } from "@/lib/gst";
import {
  addSupplierPayment,
  batchBalance,
  getDataMode,
  listSuppliers,
  setDataMode,
  supplierByName,
  supplierPaymentsFor,
  upsertSupplier,
  type SupplierInput,
} from "./suppliers";
import { TABLES_IN_DELETE_ORDER } from "./schema";

/**
 * All business rules live here, run inside one database transaction per action.
 * Each function returns a Patch of everything it changed.
 */

export class UserError extends Error {}

const uid = (p: string) => `${p}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const now = () => new Date().toISOString();
const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function event(q: Q, machineId: string, text: string, kind: HistoryEvent["kind"], by: Staff) {
  await q.query("insert into machine_events (machine_id, at, text, kind, by_name) values ($1, now(), $2, $3, $4)", [
    machineId,
    text,
    kind,
    by.name,
  ]);
}

/** one history line for many machines in a single statement */
async function events(q: Q, ids: string[], text: string, kind: HistoryEvent["kind"], by: Staff) {
  if (!ids.length) return;
  await q.query(
    "insert into machine_events (machine_id, at, text, kind, by_name) select unnest($1::text[]), now(), $2, $3, $4",
    [ids, text, kind, by.name],
  );
}

async function activity(q: Q, text: string, kind: Activity["kind"], by: Staff) {
  const id = uid("a");
  await q.query("insert into activity (id, at, text, kind, by_name) values ($1, now(), $2, $3, $4)", [id, text, kind, by.name]);
  return id;
}

async function nextCode(q: Q, seq: string, prefix: string) {
  const rows = await q.query<{ n: string | number }>(`select nextval('${seq}') as n`);
  return `${prefix}-${rows[0].n}`;
}

async function lockMachine(q: Q, id: string) {
  const rows = await q.query<Record<string, unknown>>("select * from machines where id = $1 for update", [id]);
  if (!rows[0]) throw new UserError("This machine doesn't exist any more. Refresh and try again.");
  return rows[0];
}

/* ---------------- Stock in ---------------- */

export type NewMachine = {
  serial: string;
  type: MachineType;
  brand: string;
  model: string;
  cpu: string;
  gen: number;
  ram: number;
  storage: number;
  storageType: "SSD" | "HDD";
  screen?: number;
  cost?: number;
  condition?: "Used" | "Refurbished" | "New";
};

export async function addBatch(
  q: Q,
  by: Staff,
  input: {
    supplier: string;
    supplierType: SupplierType;
    totalCost: number;
    location: Location;
    items: NewMachine[];
    billNo?: string;
    payDays?: number; // days we have to pay; default: the supplier's usual terms
    paidNow?: number;
    paidMode?: PaymentMode;
  },
): Promise<Patch & { batchCode: string }> {
  const items = input.items.filter((i) => i.serial.trim());
  if (!input.supplier.trim()) throw new UserError("Enter who you bought this batch from.");
  if (!items.length) throw new UserError("Add at least one machine.");
  if (items.length > 2000) throw new UserError("Add at most 2,000 machines in one batch.");
  const serials = items.map((i) => i.serial.trim().toUpperCase());
  if (new Set(serials).size !== serials.length) throw new UserError("The same serial number appears twice in this batch.");
  const taken = await q.query<{ serial: string }>("select serial from machines where upper(serial) = any($1)", [serials]);
  if (taken.length) throw new UserError(`Already in stock: ${taken.slice(0, 3).map((t) => t.serial).join(", ")}${taken.length > 3 ? "…" : ""}`);

  const sheetCost = items.reduce((s, i) => s + (i.cost || 0), 0);
  const total = Math.round(input.totalCost || sheetCost);
  if (total <= 0) throw new UserError("Enter the total paid for the batch.");
  const perUnit = Math.round(total / items.length);

  // only owner and manager deal with supplier money; others just add the machines
  const paidNow = can(by.role, "billing") ? Math.max(0, Math.round(input.paidNow || 0)) : 0;
  if (paidNow > total) throw new UserError(`You can't pay more than the batch cost of ${rs(total)}.`);
  if (paidNow > 0 && !PAYMENT_MODES.includes(input.paidMode ?? "Cash")) throw new UserError("Pick how you paid the supplier.");

  // the supplier is remembered, with their usual payment terms
  const known = await supplierByName(q, input.supplier);
  const payDays = Math.max(0, Math.min(365, Math.round(input.payDays ?? known?.termsDays ?? 0)));
  const supplierName = known?.name ?? input.supplier.trim();
  await upsertSupplier(q, { ...known, name: supplierName, kind: input.supplierType, termsDays: payDays }, known?.id);

  const code = await nextCode(q, "batch_code_seq", "B");
  const batchId = uid("b");
  await q.query(
    "insert into batches (id, code, supplier, supplier_type, date, total_cost, count, bill_no, due_date) values ($1,$2,$3,$4,now(),$5,$6,$7,now() + $8::int * interval '1 day')",
    [batchId, code, supplierName, input.supplierType, total, items.length, input.billNo?.trim() || null, payDays],
  );
  const spIds: string[] = [];
  if (paidNow > 0) {
    spIds.push(await addSupplierPayment(q, { batchId, supplier: supplierName, amount: paidNow, mode: input.paidMode ?? "Cash", reference: "Paid on purchase", byName: by.name }));
  }
  const ids = items.map(() => uid("m"));
  await insertMany(
    q,
    "machines",
    ["id", "serial", "batch_id", "type", "brand", "model", "cpu", "gen", "ram", "storage", "storage_type", "screen", "condition",
      "stage", "location", "cost", "added_at", "updated_at"],
    items.map((it, i) => [
      ids[i], it.serial.trim().toUpperCase(), batchId, it.type, it.brand, it.model, it.cpu, it.gen, it.ram, it.storage, it.storageType,
      it.screen ?? null, it.condition ?? "Used", "checking", input.location, it.cost || perUnit, now(), now(),
    ]),
    150,
  );
  await events(q, ids, `Added with batch ${code} from ${supplierName}`, "added", by);
  const act = await activity(q, `New batch ${code}: ${items.length} machines from ${supplierName}`, "batch", by);
  return {
    batchCode: code,
    batches: await batchesByIds(q, [batchId]),
    machines: await machinesByIds(q, ids),
    activity: await activityByIds(q, [act]),
    suppliers: await listSuppliers(q),
    supplierPayments: spIds.length ? await supplierPaymentsFor(q, spIds) : undefined,
  };
}

/* ---------------- Check & repair ---------------- */

export type CheckInput = {
  id: string;
  failed: string[];
  battery?: number;
  wiped: boolean;
  grade: Grade | null;
  outcome: "ready" | "repair" | "scrap";
  upgrade?: { ram?: number; storage?: number; cost: number };
};

export async function checkMachine(q: Q, by: Staff, c: CheckInput): Promise<Patch> {
  const m = await lockMachine(q, c.id);
  if (m.stage !== "checking") throw new UserError("This machine was already checked by someone else.");
  if (c.outcome === "ready" && (!c.grade || !c.wiped)) throw new UserError("Pick a grade and confirm the data wipe first.");
  if (c.outcome === "repair" && !c.failed.length) throw new UserError("Tap what doesn't work before sending it to repair.");

  let ram = Number(m.ram);
  let storage = Number(m.storage);
  let storageType = m.storage_type as string;
  let repairCost = Number(m.repair_cost);
  if (c.upgrade) {
    const parts: string[] = [];
    if (c.upgrade.ram && c.upgrade.ram > ram) {
      parts.push(`RAM ${ram} GB → ${c.upgrade.ram} GB`);
      ram = c.upgrade.ram;
    }
    if (c.upgrade.storage && c.upgrade.storage > storage) {
      parts.push(`Storage ${storage} GB → ${c.upgrade.storage} GB SSD`);
      storage = c.upgrade.storage;
      storageType = "SSD";
    }
    if (parts.length) {
      repairCost += Math.max(0, Math.round(c.upgrade.cost || 0));
      await event(q, c.id, `Upgraded: ${parts.join(", ")} (${rs(c.upgrade.cost || 0)})`, "upgrade", by);
    }
  }
  const grade = c.outcome === "ready" ? c.grade : null;
  const price = grade ? askingPrice({ cost: Number(m.cost), repairCost, grade, ram, storage }) : 0;
  await q.query(
    `update machines set ram=$2, storage=$3, storage_type=$4, repair_cost=$5, failed_checks=$6, battery=$7, wiped=$8,
      grade=$9, stage=$10, price=$11, updated_at=now() where id=$1`,
    [c.id, ram, storage, storageType, repairCost, c.failed.length ? c.failed : null, c.battery ?? null, c.wiped, grade, c.outcome, price],
  );
  await event(
    q,
    c.id,
    c.outcome === "ready"
      ? `Checked: ${c.failed.length ? `minor issues (${c.failed.join(", ")})` : "all tests passed"} · Grade ${grade}${c.wiped ? " · Data wiped" : ""}`
      : c.outcome === "repair"
        ? `Checked: failed ${c.failed.join(", ")} — sent to repair`
        : `Checked: failed ${c.failed.join(", ") || "multiple tests"} — marked as scrap`,
    "checked",
    by,
  );
  const name = `${m.brand} ${m.model}`;
  const act = await activity(
    q,
    c.outcome === "ready" ? `${name} checked — Grade ${grade}, ready to sell` : c.outcome === "repair" ? `${name} sent to repair` : `${name} marked as scrap`,
    "check",
    by,
  );
  return { machines: await machinesByIds(q, [c.id]), activity: await activityByIds(q, [act]) };
}

export async function finishRepair(q: Q, by: Staff, a: { id: string; part: string; cost: number; grade: Grade }): Promise<Patch> {
  const m = await lockMachine(q, a.id);
  if (m.stage !== "repair") throw new UserError("This machine is not in repair any more.");
  if (!a.part.trim()) throw new UserError("Say what was fixed.");
  const repairCost = Number(m.repair_cost) + Math.max(0, Math.round(a.cost || 0));
  const price = askingPrice({ cost: Number(m.cost), repairCost, grade: a.grade, ram: Number(m.ram), storage: Number(m.storage) });
  await q.query(
    "update machines set repair_cost=$2, grade=$3, stage='ready', wiped=true, failed_checks=null, price=$4, updated_at=now() where id=$1",
    [a.id, repairCost, a.grade, price],
  );
  await event(q, a.id, `Repaired: ${a.part.trim()} (${rs(a.cost || 0)}) · Grade ${a.grade} · Ready to sell`, "repair", by);
  const act = await activity(q, `${m.brand} ${m.model} repaired: ${a.part.trim()}`, "repair", by);
  return { machines: await machinesByIds(q, [a.id]), activity: await activityByIds(q, [act]) };
}

/* ---------------- Moving & price ---------------- */

export async function moveMachines(q: Q, by: Staff, a: { ids: string[]; to: Location }): Promise<Patch> {
  if (!a.ids.length) throw new UserError("Pick at least one machine.");
  const rows = await q.query<{ id: string; location: string }>(
    "select id, location from machines where id = any($1) and stage not in ('sold','scrap') for update",
    [a.ids],
  );
  const moving = rows.filter((r) => r.location !== a.to);
  for (const from of ["Shop", "Godown"]) {
    await events(q, moving.filter((r) => r.location === from).map((r) => r.id), `Moved from ${from} to ${a.to}`, "moved", by);
  }
  if (moving.length)
    await q.query("update machines set location=$2, updated_at=now() where id = any($1)", [moving.map((r) => r.id), a.to]);
  const act = moving.length
    ? await activity(q, `${moving.length} machine${moving.length > 1 ? "s" : ""} moved to the ${a.to.toLowerCase()}`, "move", by)
    : null;
  return { machines: await machinesByIds(q, moving.map((r) => r.id)), activity: act ? await activityByIds(q, [act]) : [] };
}

export async function setPrice(q: Q, by: Staff, a: { id: string; price: number }): Promise<Patch> {
  const m = await lockMachine(q, a.id);
  if (m.stage !== "ready") throw new UserError("Only ready machines have an asking price.");
  if (!(a.price > 0)) throw new UserError("Enter a price above zero.");
  await q.query("update machines set price=$2, updated_at=now() where id=$1", [a.id, Math.round(a.price)]);
  await event(q, a.id, `Asking price changed from ${rs(Number(m.price))} to ${rs(a.price)}`, "moved", by);
  return { machines: await machinesByIds(q, [a.id]) };
}

/* ---------------- Big orders ---------------- */

export type BuyerInput = { name: string; phone?: string; gstin?: string; state: string; address?: string; termsDays: number };

function checkBuyer(b: BuyerInput) {
  if (!b.name.trim()) throw new UserError("Enter the buyer's name.");
  if (!STATES.some((s) => s.name === b.state)) throw new UserError("Pick the buyer's state.");
  if (b.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(b.gstin.trim())) throw new UserError("A GSTIN has 15 letters and digits, starting with the state code.");
  if (!(b.termsDays >= 0 && b.termsDays <= 180)) throw new UserError("Payment terms must be between 0 and 180 days.");
}

export async function createOrder(
  q: Q,
  by: Staff,
  a: { buyer: string; need: Requirement; unitPrice: number; buyerDetails?: BuyerInput },
): Promise<Patch & { orderCode: string }> {
  if (!a.buyer.trim()) throw new UserError("Enter the buyer's name.");
  const known = await buyerByName(q, a.buyer);
  if (!known) {
    const details = a.buyerDetails ?? { name: a.buyer, state: (await getSettings(q)).state, termsDays: 30 };
    checkBuyer({ ...details, name: a.buyer });
    await upsertBuyer(q, { ...details, name: a.buyer.trim() });
  }
  if (!(a.unitPrice > 0)) throw new UserError("Enter the price per machine.");
  // lock the ready stock so two people can't book the same machines
  const ready = await q.query<{ id: string }>("select id from machines where stage = 'ready' for update");
  const readyMachines = await machinesByIds(q, ready.map((r) => r.id));
  const { picked } = pickForRequirement(readyMachines, a.need);
  if (!picked.length) throw new UserError("No ready machines fit this order.");

  const id = uid("o");
  const code = await nextCode(q, "order_code_seq", "BO");
  const need = { ...a.need, qty: picked.length };
  await q.query(
    "insert into orders (id, code, buyer, created_at, status, need, unit_price) values ($1,$2,$3,now(),'booked',$4,$5)",
    [id, code, a.buyer.trim(), JSON.stringify(need), Math.round(a.unitPrice)],
  );
  const ids = picked.map((m) => m.id);
  await q.query(
    "insert into order_items (order_id, machine_id) select $1, unnest($2::text[])",
    [id, ids],
  );
  await q.query("update machines set stage='booked', order_id=$2, updated_at=now() where id = any($1)", [ids, id]);
  await events(q, ids, `Booked for big order ${code} (${a.buyer.trim()})`, "booked", by);
  const act = await activity(q, `Big order ${code} booked: ${ids.length} machines for ${a.buyer.trim()}`, "order", by);
  return {
    orderCode: code,
    buyers: await listBuyers(q),
    orders: await ordersByIds(q, [id]),
    machines: await machinesByIds(q, ids),
    activity: await activityByIds(q, [act]),
  };
}

export async function dispatchOrder(q: Q, by: Staff, a: { id: string }): Promise<Patch & { invoiceNumber: string }> {
  const [o] = await ordersByIds(q, [a.id]);
  if (!o || o.status !== "booked") throw new UserError("This order is not waiting for dispatch.");
  await q.query("update orders set status='dispatched', dispatched_at=now() where id=$1", [a.id]);
  await q.query(
    "update machines set stage='sold', sold_price=$2, sold_to=$3, updated_at=now() where id = any($1) and stage='booked'",
    [o.machineIds, o.unitPrice, o.buyer],
  );
  await events(q, o.machineIds, `Dispatched to ${o.buyer} with ${o.code}`, "sold", by);
  const settings = await getSettings(q);
  const buyer = (await buyerByName(q, o.buyer)) ?? { name: o.buyer, state: settings.state, termsDays: 30 };
  const ms = await machinesForInvoice(q, o.machineIds);
  const invoiceId = await createInvoice(q, {
    kind: "order",
    refId: o.id,
    refCode: o.code,
    buyer,
    items: ms.map((m) => ({ machine: m, amount: o.unitPrice })),
    byName: by.name,
    settings,
  });
  const [inv] = await invoicesByIds(q, [invoiceId]);
  const act = await activity(q, `Big order ${o.code} dispatched to ${o.buyer} — invoice ${inv.number}`, "dispatch", by);
  return {
    invoiceNumber: inv.number,
    invoices: [inv],
    orders: await ordersByIds(q, [a.id]),
    machines: await machinesByIds(q, o.machineIds),
    activity: await activityByIds(q, [act]),
  };
}

export async function cancelOrder(q: Q, by: Staff, a: { id: string }): Promise<Patch> {
  const [o] = await ordersByIds(q, [a.id]);
  if (!o || o.status !== "booked") throw new UserError("Only booked orders can be cancelled.");
  await q.query("update orders set status='cancelled' where id=$1", [a.id]);
  await q.query("update machines set stage='ready', order_id=null, updated_at=now() where id = any($1) and stage='booked'", [o.machineIds]);
  await events(q, o.machineIds, `Released from cancelled order ${o.code}`, "released", by);
  const act = await activity(q, `Big order ${o.code} cancelled — ${o.machineIds.length} machines back in stock`, "order", by);
  return {
    orders: await ordersByIds(q, [a.id]),
    machines: await machinesByIds(q, o.machineIds),
    activity: await activityByIds(q, [act]),
  };
}

/* ---------------- Shop sales & returns ---------------- */

export async function shopSell(
  q: Q,
  by: Staff,
  a: { machineId: string; customer: string; phone: string; price: number; warrantyMonths: number; paymentMode: PaymentMode; reference?: string },
): Promise<Patch & { saleId: string; invoiceId: string }> {
  if (!PAYMENT_MODES.includes(a.paymentMode)) throw new UserError("Pick how the customer paid.");
  const m = await lockMachine(q, a.machineId);
  if (m.stage === "booked") {
    const [o] = await ordersByIds(q, [m.order_id as string]);
    throw new UserError(`This machine is booked for big order ${o?.code ?? ""} (${o?.buyer ?? "a buyer"}). Pick another one.`);
  }
  if (m.stage === "sold") throw new UserError(`Already sold to ${m.sold_to ?? "a customer"}.`);
  if (m.stage !== "ready") throw new UserError("This machine is not checked yet. Finish Check & grade first.");
  if (!a.customer.trim()) throw new UserError("Enter the customer's name.");
  if (!/^\d{10}$/.test(a.phone.trim())) throw new UserError("Enter a 10-digit phone number.");
  if (!(a.price > 0)) throw new UserError("Enter the selling price.");

  const id = uid("s");
  const code = await nextCode(q, "sale_code_seq", "SS");
  await q.query(
    "insert into sales (id, code, machine_id, customer, phone, price, warranty_months, at, by_name) values ($1,$2,$3,$4,$5,$6,$7,now(),$8)",
    [id, code, a.machineId, a.customer.trim(), a.phone.trim(), Math.round(a.price), a.warrantyMonths, by.name],
  );
  await q.query("update machines set stage='sold', sold_price=$2, sold_to=$3, updated_at=now() where id=$1", [
    a.machineId,
    Math.round(a.price),
    a.customer.trim(),
  ]);
  await event(q, a.machineId, `Sold at the shop to ${a.customer.trim()} (${code})`, "sold", by);
  const settings = await getSettings(q);
  const [mi] = await machinesForInvoice(q, [a.machineId]);
  const invoiceId = await createInvoice(q, {
    kind: "shop",
    refId: id,
    refCode: code,
    buyer: { name: a.customer.trim(), phone: a.phone.trim(), state: settings.state, termsDays: 0 },
    items: [{ machine: mi, amount: Math.round(a.price) }],
    byName: by.name,
    settings,
  });
  await addPayment(q, { invoiceId, amount: Math.round(a.price), mode: a.paymentMode, reference: a.reference, byName: by.name });
  const act = await activity(q, `Shop sale ${code}: ${m.brand} ${m.model} to ${a.customer.trim()}`, "sale", by);
  return {
    saleId: id,
    invoiceId,
    invoices: await invoicesByIds(q, [invoiceId]),
    payments: await paymentsFor(q, [invoiceId]),
    sales: await salesByIds(q, [id]),
    machines: await machinesByIds(q, [a.machineId]),
    activity: await activityByIds(q, [act]),
  };
}

export async function recordReturn(q: Q, by: Staff, a: { machineId: string; reason: string; refund: number }): Promise<Patch> {
  const m = await lockMachine(q, a.machineId);
  if (m.stage !== "sold") throw new UserError("Only sold machines can come back as a return.");
  if (!a.reason.trim()) throw new UserError("Write why it came back.");

  const sale = (await q.query<Record<string, unknown>>("select code, customer from sales where machine_id=$1 order by at desc limit 1", [a.machineId]))[0];
  const order = m.order_id ? (await ordersByIds(q, [m.order_id as string]))[0] : undefined;
  const from = sale && sale.customer === m.sold_to ? "shop" : "order";
  const refCode = from === "shop" ? (sale?.code as string) : (order?.code ?? "—");
  const customer = from === "shop" ? (sale?.customer as string) : (order?.buyer ?? String(m.sold_to ?? ""));

  const id = uid("r");
  const code = await nextCode(q, "return_code_seq", "RT");
  await q.query(
    "insert into returns (id, code, machine_id, source, ref_code, customer, reason, refund, at, by_name) values ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)",
    [id, code, a.machineId, from, refCode, customer, a.reason.trim(), Math.max(0, Math.round(a.refund || 0)), by.name],
  );
  // back to the start of the line: it must be checked again before it can be sold
  await q.query(
    "update machines set stage='checking', grade=null, price=0, wiped=false, sold_price=null, sold_to=null, order_id=null, location='Shop', updated_at=now() where id=$1",
    [a.machineId],
  );
  await event(q, a.machineId, `Returned by ${customer} (${refCode}): ${a.reason.trim()}${a.refund ? ` · refunded ${rs(a.refund)}` : ""}`, "returned", by);
  const act = await activity(q, `Return ${code}: ${m.brand} ${m.model} from ${customer} — ${a.reason.trim()}`, "return", by);
  return {
    returns: await returnsByIds(q, [id]),
    machines: await machinesByIds(q, [a.machineId]),
    activity: await activityByIds(q, [act]),
  };
}

/* ---------------- Staff ---------------- */

export async function saveStaff(
  q: Q,
  by: Staff,
  a: { id?: string; name: string; role: Role; pin?: string; active: boolean },
): Promise<Patch> {
  if (!a.name.trim()) throw new UserError("Enter a name.");
  if (a.pin !== undefined && a.pin !== "" && !/^\d{4}$/.test(a.pin)) throw new UserError("The PIN must be 4 digits.");
  if (a.id) {
    if (a.id === by.id && (a.role !== "owner" || !a.active)) throw new UserError("You can't remove your own owner access.");
    await q.query("update staff set name=$2, role=$3, active=$4 where id=$1", [a.id, a.name.trim(), a.role, a.active]);
    if (a.pin) await q.query("update staff set pin_hash=$2 where id=$1", [a.id, hashPin(a.pin)]);
  } else {
    if (!a.pin) throw new UserError("Set a 4-digit PIN for the new staff member.");
    await q.query("insert into staff (id, name, role, pin_hash, active) values ($1,$2,$3,$4,$5)", [uid("st"), a.name.trim(), a.role, hashPin(a.pin), a.active]);
  }
  await activity(q, a.id ? `Staff updated: ${a.name.trim()}` : `New staff added: ${a.name.trim()}`, "staff", by);
  return { staff: await staffList(q) };
}

/* ---------------- Money ---------------- */

export async function recordPayment(
  q: Q,
  by: Staff,
  a: { invoiceId: string; amount: number; mode: PaymentMode; reference?: string },
): Promise<Patch> {
  const [inv] = await invoicesByIds(q, [a.invoiceId]);
  if (!inv) throw new UserError("This invoice doesn't exist.");
  if (!PAYMENT_MODES.includes(a.mode)) throw new UserError("Pick how they paid.");
  await q.query("select id from invoices where id = $1 for update", [a.invoiceId]);
  const paid = (await paymentsFor(q, [a.invoiceId])).reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((inv.total - paid) * 100) / 100;
  if (!(a.amount > 0)) throw new UserError("Enter the amount received.");
  if (a.amount > balance + 0.5) throw new UserError(`Only ${rs(balance)} is due on this invoice.`);
  await addPayment(q, { invoiceId: a.invoiceId, amount: a.amount, mode: a.mode, reference: a.reference, byName: by.name });
  const act = await activity(q, `${rs(a.amount)} received from ${inv.buyerName} against ${inv.number} (${a.mode})`, "payment", by);
  return { payments: await paymentsFor(q, [a.invoiceId]), activity: await activityByIds(q, [act]) };
}

export async function saveSettings(q: Q, by: Staff, s: BusinessSettings): Promise<Patch> {
  if (!s.businessName.trim()) throw new UserError("Enter the business name.");
  if (s.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(s.gstin.trim())) throw new UserError("A GSTIN has 15 letters and digits, starting with the state code.");
  if (!STATES.some((x) => x.name === s.state)) throw new UserError("Pick the shop's state.");
  if (!/^[A-Z0-9-]{1,6}$/i.test(s.invoicePrefix.trim())) throw new UserError("Invoice prefix: up to 6 letters or digits, like SA.");
  if (![5, 12, 18, 28].includes(Number(s.gstRate))) throw new UserError("GST rate must be 5, 12, 18 or 28%.");
  const clean: BusinessSettings = {
    ...s,
    businessName: s.businessName.trim(),
    gstin: s.gstin.trim().toUpperCase(),
    invoicePrefix: s.invoicePrefix.trim().toUpperCase(),
    gstRate: Number(s.gstRate),
    warrantyMonths: Math.max(0, Math.min(24, Math.round(Number(s.warrantyMonths) || 0))),
  };
  await putSettings(q, clean);
  await activity(q, "Business settings updated", "settings", by);
  return { settings: clean };
}

export async function saveBuyer(q: Q, by: Staff, b: BuyerInput & { id?: string }): Promise<Patch> {
  checkBuyer(b);
  const clash = await buyerByName(q, b.name);
  if (clash && clash.id !== b.id) throw new UserError("A buyer with this name already exists.");
  await upsertBuyer(q, b);
  return { buyers: await listBuyers(q) };
}

/* ---------------- Suppliers (money going out) ---------------- */

export async function paySupplier(
  q: Q,
  by: Staff,
  a: { batchId: string; amount: number; mode: PaymentMode; reference?: string },
): Promise<Patch> {
  if (!PAYMENT_MODES.includes(a.mode)) throw new UserError("Pick how you paid.");
  const b = await batchBalance(q, a.batchId);
  if (!b) throw new UserError("This batch doesn't exist.");
  if (!(a.amount > 0)) throw new UserError("Enter the amount paid.");
  if (a.amount > b.balance + 0.5) throw new UserError(`Only ${rs(b.balance)} is still owed on batch ${b.code}.`);
  const id = await addSupplierPayment(q, { batchId: a.batchId, supplier: b.supplier, amount: a.amount, mode: a.mode, reference: a.reference, byName: by.name });
  const act = await activity(q, `${rs(a.amount)} paid to ${b.supplier} for batch ${b.code} (${a.mode})`, "supplier", by);
  return { supplierPayments: await supplierPaymentsFor(q, [id]), activity: await activityByIds(q, [act]) };
}

export async function saveSupplier(q: Q, by: Staff, s: SupplierInput & { id?: string }): Promise<Patch> {
  if (!s.name.trim()) throw new UserError("Enter the supplier's name.");
  if (s.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(s.gstin.trim())) throw new UserError("A GSTIN has 15 letters and digits.");
  if (s.phone && !/^[0-9+ -]{8,15}$/.test(s.phone.trim())) throw new UserError("Check the phone number.");
  const terms = Math.round(Number(s.termsDays ?? 0));
  if (!(terms >= 0 && terms <= 365)) throw new UserError("Payment days must be between 0 and 365.");
  const clash = await supplierByName(q, s.name);
  if (clash && clash.id !== s.id) throw new UserError("A supplier with this name already exists.");
  let batches: Patch["batches"];
  if (s.id) {
    const [old] = await listSuppliers(q, [s.id]);
    if (old && old.name !== s.name.trim()) {
      // keep the batches pointing at the renamed supplier
      const ids = await q.query<{ id: string }>("update batches set supplier = $2 where supplier = $1 returning id", [old.name, s.name.trim()]);
      await q.query("update supplier_payments set supplier = $2 where supplier = $1", [old.name, s.name.trim()]);
      batches = await batchesByIds(q, ids.map((r) => r.id));
    }
  }
  await upsertSupplier(q, { ...s, termsDays: terms }, s.id);
  return { suppliers: await listSuppliers(q), batches, supplierPayments: s.id ? await supplierPaymentsFor(q) : undefined };
}

/* ---------------- Bringing in the shop's real stock ---------------- */

export type ImportRow = NewMachine & {
  stage: "checking" | "repair" | "ready" | "scrap";
  grade?: Grade | null;
  location: Location;
  cost: number;
  price?: number;
  battery?: number;
  supplier?: string;
  boughtOn?: string; // ISO date
};

/**
 * Loads stock the shop already has (from its Excel sheet) with each machine's current status.
 * Machines are grouped into one "opening stock" batch per supplier. Opening stock is treated as paid
 * unless the owner says money is still owed.
 */
export async function importStock(
  q: Q,
  by: Staff,
  a: { rows: ImportRow[]; alreadyPaid: boolean },
): Promise<Patch & { imported: number; batchCodes: string[] }> {
  const rows = a.rows.filter((r) => r.serial?.trim());
  if (!rows.length) throw new UserError("There are no machines to import.");
  if (rows.length > 5000) throw new UserError("Import at most 5,000 machines at a time — split the sheet.");
  const serials = rows.map((r) => r.serial.trim().toUpperCase());
  if (new Set(serials).size !== serials.length) throw new UserError("The same serial number appears twice in the sheet.");
  const taken = await q.query<{ serial: string }>("select serial from machines where upper(serial) = any($1)", [serials]);
  if (taken.length) throw new UserError(`Already in stock: ${taken.slice(0, 3).map((t) => t.serial).join(", ")}${taken.length > 3 ? "…" : ""}`);

  for (const r of rows) {
    if (!["checking", "repair", "ready", "scrap"].includes(r.stage)) throw new UserError(`${r.serial}: unknown status.`);
    if (!["Shop", "Godown"].includes(r.location)) throw new UserError(`${r.serial}: location must be Shop or Godown.`);
    if (r.grade && !["A", "B", "C"].includes(r.grade)) throw new UserError(`${r.serial}: grade must be A, B or C.`);
    if (!(r.cost >= 0) || !(r.gen > 0) || !(r.ram > 0) || !(r.storage > 0)) throw new UserError(`${r.serial}: check cost, generation, RAM and storage.`);
  }

  // one batch per supplier
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const key = r.supplier?.trim() || "Opening stock";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const batchIds: string[] = [];
  const batchCodes: string[] = [];
  const machineIds: string[] = [];
  const spIds: string[] = [];
  const stamp = now();
  for (const [supplier, items] of groups) {
    const known = await supplierByName(q, supplier);
    const name = known?.name ?? supplier;
    const kind: SupplierType = known?.kind ?? "Dealer";
    if (!known) await upsertSupplier(q, { name, kind, termsDays: 0 });
    const dates = items.map((i) => i.boughtOn).filter((d): d is string => !!d && !Number.isNaN(Date.parse(d))).sort();
    const date = dates[0] ?? stamp;
    const total = items.reduce((s, i) => s + Math.round(i.cost || 0), 0);
    const code = await nextCode(q, "batch_code_seq", "B");
    const batchId = uid("b");
    await q.query(
      "insert into batches (id, code, supplier, supplier_type, date, total_cost, count, note, due_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$5)",
      [batchId, code, name, kind, date, total, items.length, "Opening stock — imported from the shop's sheet"],
    );
    if (a.alreadyPaid && total > 0) {
      spIds.push(await addSupplierPayment(q, { batchId, supplier: name, amount: total, mode: "Bank transfer", reference: "Opening stock (paid before the app)", at: date, byName: by.name }));
    }
    const ids = items.map(() => uid("m"));
    await insertMany(
      q,
      "machines",
      ["id", "serial", "batch_id", "type", "brand", "model", "cpu", "gen", "ram", "storage", "storage_type", "screen", "condition",
        "grade", "stage", "location", "cost", "price", "wiped", "battery", "added_at", "updated_at"],
      items.map((it, i) => {
        const grade = it.stage === "ready" ? (it.grade ?? "B") : (it.grade ?? null);
        const price = it.price && it.price > 0 ? Math.round(it.price)
          : it.stage === "ready" ? askingPrice({ cost: it.cost, repairCost: 0, grade, ram: it.ram, storage: it.storage }) : 0;
        return [
          ids[i], it.serial.trim().toUpperCase(), batchId, it.type, it.brand.trim(), it.model.trim(), it.cpu, it.gen, it.ram, it.storage,
          it.storageType, it.screen ?? null, it.condition ?? "Used", grade, it.stage, it.location, Math.round(it.cost || 0), price,
          it.stage === "ready", it.battery ?? null, date, stamp,
        ];
      }),
      150,
    );
    await events(q, ids, `Imported as opening stock (batch ${code})`, "added", by);
    batchIds.push(batchId);
    batchCodes.push(code);
    machineIds.push(...ids);
  }
  const act = await activity(q, `Imported ${rows.length.toLocaleString("en-IN")} machines of existing stock (${batchCodes.join(", ")})`, "batch", by);
  return {
    imported: rows.length,
    batchCodes,
    batches: await batchesByIds(q, batchIds),
    machines: await machinesByIds(q, machineIds),
    suppliers: await listSuppliers(q),
    supplierPayments: spIds.length ? await supplierPaymentsFor(q, spIds) : undefined,
    activity: await activityByIds(q, [act]),
  };
}

/**
 * Owner only: clears every sample machine, batch, order, sale, bill and payment so the shop can start with its own data.
 * Staff, PINs and business settings are kept. Bill numbering starts again from 0001.
 */
export async function startLive(q: Q, by: Staff, a: { confirm: string }): Promise<Patch> {
  if (a.confirm.trim().toUpperCase() !== "START") throw new UserError('Type START to confirm.');
  for (const t of TABLES_IN_DELETE_ORDER) await q.query(`delete from ${t}`);
  await setDataMode(q, "live");
  await activity(q, "Sample data cleared — the shop's real data starts here", "settings", by);
  return {};
}

export async function assertSampleMode(q: Q) {
  if ((await getDataMode(q)) === "live") throw new UserError("Your real data is in use, so sample data can't be loaded over it.");
}
