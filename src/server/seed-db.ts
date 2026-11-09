import "server-only";
import { randomBytes } from "node:crypto";
import type { Db, Q } from "./db";
import { TABLES_IN_DELETE_ORDER } from "./schema";
import { buildSeed } from "@/lib/data/seed";
import { hashPin } from "./pin";

/** Starting staff for the demo. The owner can change names and PINs on the Staff page. */
export const DEMO_STAFF = [
  { id: "st-owner", name: "Shop owner", role: "owner", pin: "1111" },
  { id: "st-manager", name: "Manager", role: "manager", pin: "2222" },
  { id: "st-tech", name: "Ravi (technician)", role: "technician", pin: "3333" },
  { id: "st-counter", name: "Salma (counter)", role: "counter", pin: "4444" },
] as const;

export async function insertMany(q: Q, table: string, cols: string[], rows: unknown[][], chunk = 250) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part
      .map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(",")})`)
      .join(",");
    await q.query(`insert into ${table} (${cols.join(",")}) values ${values}`, params);
  }
}

/** Fill the business tables with the sample stock (≈1,300 machines). Staff and settings are kept. */
export async function loadSampleData(q: Q) {
  for (const t of TABLES_IN_DELETE_ORDER) await q.query(`delete from ${t}`);
  const d = buildSeed();

  await insertMany(
    q,
    "batches",
    ["id", "code", "supplier", "supplier_type", "date", "total_cost", "count", "note"],
    d.batches.map((b) => [b.id, b.code, b.supplier, b.supplierType, b.date, b.totalCost, b.count, b.note ?? null]),
  );
  await insertMany(
    q,
    "orders",
    ["id", "code", "buyer", "created_at", "status", "need", "unit_price", "dispatched_at"],
    d.orders.map((o) => [o.id, o.code, o.buyer, o.createdAt, o.status, JSON.stringify(o.need), o.unitPrice, o.dispatchedAt ?? null]),
  );
  await insertMany(
    q,
    "machines",
    [
      "id", "serial", "batch_id", "type", "brand", "model", "cpu", "gen", "ram", "storage", "storage_type", "screen",
      "condition", "grade", "stage", "location", "cost", "repair_cost", "price", "sold_price", "sold_to", "order_id",
      "wiped", "battery", "failed_checks", "added_at", "updated_at",
    ],
    d.machines.map((m) => [
      m.id, m.serial, m.batchId, m.type, m.brand, m.model, m.cpu, m.gen, m.ram, m.storage, m.storageType, m.screen ?? null,
      m.condition, m.grade, m.stage, m.location, m.cost, m.repairCost, m.price, m.soldPrice ?? null, m.soldTo ?? null,
      m.orderId ?? null, m.wiped, m.battery ?? null, m.failedChecks ?? null, m.addedAt, m.updatedAt,
    ]),
    120,
  );
  await insertMany(
    q,
    "order_items",
    ["order_id", "machine_id"],
    d.orders.flatMap((o) => o.machineIds.map((id) => [o.id, id])),
  );
  await insertMany(
    q,
    "machine_events",
    ["machine_id", "at", "text", "kind", "by_name"],
    d.machines.flatMap((m) => m.history.map((h) => [m.id, h.at, h.text, h.kind, null])),
    400,
  );
  await insertMany(
    q,
    "sales",
    ["id", "code", "machine_id", "customer", "phone", "price", "warranty_months", "at", "by_name"],
    d.sales.map((s) => [s.id, s.code, s.machineId, s.customer, s.phone, s.price, s.warrantyMonths, s.at, "Salma (counter)"]),
  );
  await insertMany(
    q,
    "activity",
    ["id", "at", "text", "kind", "by_name"],
    d.activity.map((a) => [a.id, a.at, a.text, a.kind, null]),
  );

  const maxCode = (codes: string[], fallback: number) =>
    Math.max(fallback, ...codes.map((c) => +c.split("-")[1] || 0));
  await q.query(`select setval('batch_code_seq', $1)`, [maxCode(d.batches.map((b) => b.code), 1100)]);
  await q.query(`select setval('order_code_seq', $1)`, [maxCode(d.orders.map((o) => o.code), 1039)]);
  await q.query(`select setval('sale_code_seq', $1)`, [maxCode(d.sales.map((s) => s.code), 2200)]);
  await q.query(`select setval('return_code_seq', 3000)`);
}

/** First start: create the session secret, the demo staff and the sample stock. */
export async function ensureSeeded(db: Db) {
  const rows = await db.query<{ n: number }>("select count(*)::int as n from staff");
  if (rows[0].n > 0) return;
  await db.tx(async (q) => {
    await q.query(
      "insert into settings (key, value) values ('session_secret', $1) on conflict (key) do nothing",
      [randomBytes(32).toString("hex")],
    );
    for (const s of DEMO_STAFF) {
      await q.query("insert into staff (id, name, role, pin_hash) values ($1,$2,$3,$4)", [s.id, s.name, s.role, hashPin(s.pin)]);
    }
    await loadSampleData(q);
  });
}
