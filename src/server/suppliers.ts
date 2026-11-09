import "server-only";
import { randomBytes } from "node:crypto";
import type { Db, Q } from "./db";
import type { DataMode, PaymentMode, Supplier, SupplierPayment, SupplierType } from "@/lib/data/types";

/**
 * Money going out: the people S.A buys stock from, what each purchase batch cost,
 * and what has been paid against it. A batch's balance = total cost − payments.
 */

const uid = (p: string) => `${p}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : undefined);
type Row = Record<string, unknown>;

/* ---- sample vs live ---- */

export async function getDataMode(q: Q): Promise<DataMode> {
  const r = await q.query<{ value: string }>("select value from settings where key = 'data_mode'");
  return r[0]?.value === "live" ? "live" : "sample";
}

export async function setDataMode(q: Q, mode: DataMode) {
  await q.query("insert into settings (key, value) values ('data_mode', $1) on conflict (key) do update set value = excluded.value", [mode]);
}

/* ---- suppliers ---- */

const toSupplier = (r: Row): Supplier => ({
  id: r.id as string,
  name: r.name as string,
  kind: r.kind as SupplierType,
  phone: (r.phone as string) ?? undefined,
  gstin: (r.gstin as string) ?? undefined,
  state: r.state as string,
  address: (r.address as string) ?? undefined,
  termsDays: Number(r.terms_days),
});

export async function listSuppliers(q: Q, ids?: string[]) {
  const rows = ids
    ? await q.query<Row>("select * from suppliers where id = any($1)", [ids])
    : await q.query<Row>("select * from suppliers order by name");
  return rows.map(toSupplier);
}

export async function supplierByName(q: Q, name: string) {
  const r = await q.query<Row>("select * from suppliers where lower(name) = lower($1)", [name.trim()]);
  return r[0] ? toSupplier(r[0]) : null;
}

export type SupplierInput = {
  name: string;
  kind: SupplierType;
  phone?: string;
  gstin?: string;
  state?: string;
  address?: string;
  termsDays?: number;
};

/** Insert or update by name. Returns the id. */
export async function upsertSupplier(q: Q, s: SupplierInput, id?: string): Promise<string> {
  const existing = id ? { id } : await supplierByName(q, s.name);
  const values = [
    s.name.trim(),
    s.kind,
    s.phone?.trim() || null,
    s.gstin?.trim().toUpperCase() || null,
    s.state || "Karnataka",
    s.address?.trim() || null,
    Math.max(0, Math.round(s.termsDays ?? 0)),
  ];
  if (existing) {
    await q.query(
      "update suppliers set name=$2, kind=$3, phone=$4, gstin=$5, state=$6, address=$7, terms_days=$8 where id=$1",
      [existing.id, ...values],
    );
    return existing.id;
  }
  const newId = uid("sup");
  await q.query(
    "insert into suppliers (id, name, kind, phone, gstin, state, address, terms_days) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [newId, ...values],
  );
  return newId;
}

/* ---- payments to suppliers ---- */

const toSupplierPayment = (r: Row): SupplierPayment => ({
  id: r.id as string,
  batchId: r.batch_id as string,
  supplier: r.supplier as string,
  amount: Number(r.amount),
  mode: r.mode as PaymentMode,
  reference: (r.reference as string) ?? undefined,
  at: iso(r.at)!,
  by: (r.by_name as string) ?? undefined,
});

export async function supplierPaymentsFor(q: Q, ids?: string[]) {
  const rows = ids
    ? await q.query<Row>("select * from supplier_payments where id = any($1)", [ids])
    : await q.query<Row>("select * from supplier_payments order by at");
  return rows.map(toSupplierPayment);
}

export async function addSupplierPayment(
  q: Q,
  a: { batchId: string; supplier: string; amount: number; mode: PaymentMode; reference?: string; at?: string; byName?: string },
) {
  const id = uid("sp");
  await q.query(
    "insert into supplier_payments (id, batch_id, supplier, amount, mode, reference, at, by_name) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, a.batchId, a.supplier, Math.round(a.amount * 100) / 100, a.mode, a.reference?.trim() || null, a.at ?? new Date().toISOString(), a.byName ?? null],
  );
  return id;
}

export async function batchBalance(q: Q, batchId: string) {
  const r = await q.query<{ total: number; paid: number; supplier: string; code: string }>(
    `select b.total_cost::float as total, b.supplier, b.code,
            coalesce((select sum(amount) from supplier_payments p where p.batch_id = b.id), 0)::float as paid
       from batches b where b.id = $1 for update`,
    [batchId],
  );
  return r[0] ? { ...r[0], balance: Math.round((r[0].total - r[0].paid) * 100) / 100 } : null;
}

/* ---- sample data ---- */

const SAMPLE_TERMS: Record<string, number> = {
  "Corporate buyback": 30,
  Dealer: 15,
  "Import lot": 45,
  "Walk-in seller": 0,
};

/**
 * For sample data (or a database from before suppliers existed): one supplier per batch supplier,
 * a due date on every batch, and payments — older batches paid in full, the newest ones partly or not at all.
 */
export async function backfillSuppliers(q: Q) {
  const batches = await q.query<Row>("select * from batches order by date");
  for (const b of batches) {
    const kind = b.supplier_type as SupplierType;
    const existing = await supplierByName(q, b.supplier as string);
    if (!existing) await upsertSupplier(q, { name: b.supplier as string, kind, termsDays: SAMPLE_TERMS[kind] ?? 15 });
  }
  const suppliers = await listSuppliers(q);
  const terms = new Map(suppliers.map((s) => [s.name, s.termsDays]));

  const paidAny = await q.query<{ n: number }>("select count(*)::int as n from supplier_payments");
  if (paidAny[0].n > 0) return;

  const newest = batches.length - 1;
  for (const [i, b] of batches.entries()) {
    const date = new Date(iso(b.date)!);
    const days = terms.get(b.supplier as string) ?? 15;
    // the half-paid sample batch was agreed on short terms, so the demo shows an overdue supplier
    const due = new Date(date.getTime() + (i === newest - 1 ? Math.min(days, 7) : days) * 86_400_000);
    if (!b.due_date) await q.query("update batches set due_date = $2 where id = $1", [b.id, due.toISOString()]);
    const total = Number(b.total_cost);
    const pay = (amount: number, at: Date, mode: PaymentMode, ref: string) =>
      addSupplierPayment(q, { batchId: b.id as string, supplier: b.supplier as string, amount, mode, reference: ref, at: at.toISOString(), byName: "Shop owner" });

    if (i === newest) continue; // just arrived, nothing paid yet
    if (i === newest - 1) {
      // half paid on the day, rest still owed (and overdue if the terms are short)
      await pay(Math.round(total / 2 / 1000) * 1000, date, "Bank transfer", "Advance");
      continue;
    }
    if (days === 0) await pay(total, date, "Cash", "Paid on pickup");
    else {
      await pay(Math.round(total * 0.4 / 1000) * 1000, date, "Bank transfer", "Advance");
      await pay(total - Math.round(total * 0.4 / 1000) * 1000, new Date(date.getTime() + days * 0.9 * 86_400_000), "Bank transfer", "Balance");
    }
  }
}

/** Runs on every start: fills suppliers for sample data once. Never touches a live shop's data. */
export async function ensureSuppliers(db: Db) {
  const mode = await db.query<{ value: string }>("select value from settings where key = 'data_mode'");
  if (mode[0]?.value === "live") return;
  const n = await db.query<{ n: number }>("select count(*)::int as n from suppliers");
  const b = await db.query<{ n: number }>("select count(*)::int as n from batches");
  if (n[0].n > 0 || b[0].n === 0) return;
  await db.tx((q) => backfillSuppliers(q));
}
