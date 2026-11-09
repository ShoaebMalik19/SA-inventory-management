import "server-only";
import { randomBytes } from "node:crypto";
import type { Db, Q } from "./db";
import type { Buyer, BusinessSettings, Invoice, InvoiceLine, Payment, PaymentMode } from "@/lib/data/types";
import { computeTax, financialYear, HSN_COMPUTERS } from "@/lib/gst";
import { ordinal } from "@/lib/format";

/**
 * Billing: business settings, buyers, GST invoices and payments.
 * Invoices are created by the server only — on a shop sale and on big-order dispatch.
 */

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "S.A Computers",
  address: "702/05, KHB Main Road, Kaval Byrasandra Ext., RT Nagar Post, Bengaluru 560030",
  phone: "",
  gstin: "",
  state: "Karnataka",
  invoicePrefix: "SA",
  gstScheme: "margin",
  gstRate: 18,
  warrantyMonths: 3,
  bankDetails: "",
  invoiceNote: "Warranty covers hardware faults only. Physical or liquid damage is not covered. Goods are taken back only under warranty terms.",
};

/** Sample buyers for the demo data — states drive CGST/SGST vs IGST. GSTINs are left for the owner to fill. */
const SAMPLE_BUYERS: Omit<Buyer, "id">[] = [
  { name: "ReNew Devices Pvt Ltd", state: "Delhi", termsDays: 30 },
  { name: "Metro Refurb Hub", state: "Karnataka", termsDays: 30 },
  { name: "TechSaathi Rentals", state: "Karnataka", termsDays: 15 },
  { name: "Campus IT Solutions", state: "Tamil Nadu", termsDays: 30 },
];

const uid = (p: string) => `${p}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

/* ---------- settings ---------- */

export async function getSettings(q: Q): Promise<BusinessSettings> {
  const rows = await q.query<{ value: string }>("select value from settings where key = 'business'");
  return rows[0] ? { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) } : DEFAULT_SETTINGS;
}

export async function putSettings(q: Q, s: BusinessSettings) {
  await q.query(
    "insert into settings (key, value) values ('business', $1) on conflict (key) do update set value = excluded.value",
    [JSON.stringify(s)],
  );
}

/* ---------- buyers ---------- */

const toBuyer = (r: Row): Buyer => ({
  id: r.id as string,
  name: r.name as string,
  phone: (r.phone as string) ?? undefined,
  gstin: (r.gstin as string) ?? undefined,
  state: r.state as string,
  address: (r.address as string) ?? undefined,
  termsDays: Number(r.terms_days),
});

export async function listBuyers(q: Q) {
  return (await q.query<Row>("select * from buyers order by name")).map(toBuyer);
}

export async function buyerByName(q: Q, name: string) {
  const rows = await q.query<Row>("select * from buyers where lower(name) = lower($1)", [name.trim()]);
  return rows[0] ? toBuyer(rows[0]) : undefined;
}

export async function upsertBuyer(q: Q, b: Omit<Buyer, "id"> & { id?: string }) {
  const existing = b.id ? { id: b.id } : await buyerByName(q, b.name);
  const id = existing?.id ?? uid("by");
  await q.query(
    `insert into buyers (id, name, phone, gstin, state, address, terms_days) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (id) do update set name=$2, phone=$3, gstin=$4, state=$5, address=$6, terms_days=$7`,
    [id, b.name.trim(), b.phone?.trim() || null, b.gstin?.trim().toUpperCase() || null, b.state, b.address?.trim() || null, b.termsDays],
  );
  return id;
}

/* ---------- invoices ---------- */

export function toInvoice(r: Row): Invoice {
  return {
    id: r.id as string,
    number: r.number as string,
    fy: r.fy as string,
    date: iso(r.date),
    kind: r.kind as Invoice["kind"],
    refId: r.ref_id as string,
    refCode: r.ref_code as string,
    buyerName: r.buyer_name as string,
    buyerPhone: (r.buyer_phone as string) ?? undefined,
    buyerGstin: (r.buyer_gstin as string) ?? undefined,
    buyerState: r.buyer_state as string,
    buyerAddress: (r.buyer_address as string) ?? undefined,
    intra: !!r.intra,
    scheme: r.scheme as Invoice["scheme"],
    rate: Number(r.rate),
    lines: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as InvoiceLine[],
    taxable: Number(r.taxable),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
    total: Number(r.total),
    dueDate: iso(r.due_date),
    by: (r.by_name as string) ?? undefined,
  };
}

export const toPayment = (r: Row): Payment => ({
  id: r.id as string,
  invoiceId: r.invoice_id as string,
  amount: Number(r.amount),
  mode: r.mode as PaymentMode,
  reference: (r.reference as string) ?? undefined,
  at: iso(r.at),
  by: (r.by_name as string) ?? undefined,
});

export async function invoicesByIds(q: Q, ids?: string[]) {
  const rows = ids
    ? await q.query<Row>("select * from invoices where id = any($1)", [ids])
    : await q.query<Row>("select * from invoices order by date desc");
  return rows.map(toInvoice);
}

export async function paymentsFor(q: Q, invoiceIds?: string[]) {
  const rows = invoiceIds
    ? await q.query<Row>("select * from payments where invoice_id = any($1) order by at", [invoiceIds])
    : await q.query<Row>("select * from payments order by at");
  return rows.map(toPayment);
}

type MachineForInvoice = { id: string; serial: string; brand: string; model: string; cpu: string; gen: number; ram: number; storage: number; storageType: string; grade: string | null; cost: number };

export function describe(m: Omit<MachineForInvoice, "id" | "serial" | "cost">) {
  return `${m.brand} ${m.model}, ${m.cpu} ${ordinal(m.gen)} gen, ${m.ram} GB RAM, ${m.storage} GB ${m.storageType}${m.grade ? `, Grade ${m.grade}` : ""} (used)`;
}

export async function createInvoice(
  q: Q,
  a: {
    kind: "shop" | "order";
    refId: string;
    refCode: string;
    date?: string;
    buyer: { name: string; phone?: string; gstin?: string; state: string; address?: string; termsDays: number };
    items: { machine: MachineForInvoice; amount: number }[];
    byName?: string;
    settings?: BusinessSettings;
  },
): Promise<string> {
  const s = a.settings ?? (await getSettings(q));
  const date = a.date ? new Date(a.date) : new Date();
  const fy = financialYear(date);
  const counter = await q.query<{ n: number }>(
    "insert into invoice_counters (fy, n) values ($1, 1) on conflict (fy) do update set n = invoice_counters.n + 1 returning n",
    [fy],
  );
  const number = `${s.invoicePrefix || "INV"}/${fy}/${String(counter[0].n).padStart(4, "0")}`;
  const lines: InvoiceLine[] = a.items.map(({ machine: m, amount }) => ({
    machineId: m.id,
    serial: m.serial,
    description: describe(m),
    hsn: HSN_COMPUTERS,
    amount,
    purchase: m.cost,
  }));
  const intra = a.buyer.state === s.state;
  const t = computeTax(lines, s.gstScheme, s.gstRate, intra);
  const id = uid("inv");
  const due = new Date(date.getTime() + (a.kind === "shop" ? 0 : a.buyer.termsDays) * 86_400_000);
  await q.query(
    `insert into invoices (id, number, fy, date, kind, ref_id, ref_code, buyer_name, buyer_phone, buyer_gstin, buyer_state, buyer_address,
      intra, scheme, rate, lines, taxable, cgst, sgst, igst, total, due_date, by_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      id, number, fy, date.toISOString(), a.kind, a.refId, a.refCode, a.buyer.name, a.buyer.phone ?? null, a.buyer.gstin ?? null,
      a.buyer.state, a.buyer.address ?? null, intra, s.gstScheme, s.gstRate, JSON.stringify(lines), t.taxable, t.cgst, t.sgst, t.igst,
      t.total, due.toISOString(), a.byName ?? null,
    ],
  );
  return id;
}

export async function addPayment(
  q: Q,
  a: { invoiceId: string; amount: number; mode: PaymentMode; reference?: string; at?: string; byName?: string },
) {
  const id = uid("pay");
  await q.query("insert into payments (id, invoice_id, amount, mode, reference, at, by_name) values ($1,$2,$3,$4,$5,$6,$7)", [
    id,
    a.invoiceId,
    Math.round(a.amount * 100) / 100,
    a.mode,
    a.reference?.trim() || null,
    a.at ?? new Date().toISOString(),
    a.byName ?? null,
  ]);
  return id;
}

export async function machinesForInvoice(q: Q, ids: string[]): Promise<MachineForInvoice[]> {
  const rows = await q.query<Row>(
    "select id, serial, brand, model, cpu, gen, ram, storage, storage_type, grade, cost from machines where id = any($1)",
    [ids],
  );
  return rows.map((r) => ({
    id: r.id as string,
    serial: r.serial as string,
    brand: r.brand as string,
    model: r.model as string,
    cpu: r.cpu as string,
    gen: Number(r.gen),
    ram: Number(r.ram),
    storage: Number(r.storage),
    storageType: r.storage_type as string,
    grade: (r.grade as string) ?? null,
    cost: Number(r.cost),
  }));
}

/**
 * Sets up billing for data that existed before billing was added (the sample data, or an earlier live database):
 * default settings, buyers from past orders, and invoices + payments for past sales — in date order, so numbers run in sequence.
 */
export async function backfillBilling(q: Q) {
  const hasSettings = await q.query("select 1 from settings where key = 'business'");
  if (!hasSettings.length) await putSettings(q, DEFAULT_SETTINGS);
  const settings = await getSettings(q);

  const buyerCount = await q.query<{ n: number }>("select count(*)::int as n from buyers");
  if (buyerCount[0].n === 0) {
    for (const b of SAMPLE_BUYERS) await upsertBuyer(q, b);
    const others = await q.query<{ buyer: string }>("select distinct buyer from orders where buyer <> all($1)", [SAMPLE_BUYERS.map((b) => b.name)]);
    for (const o of others) await upsertBuyer(q, { name: o.buyer, state: settings.state, termsDays: 30 });
  }

  const invCount = await q.query<{ n: number }>("select count(*)::int as n from invoices");
  if (invCount[0].n > 0) return;

  type Job = { at: string; run: () => Promise<void> };
  const jobs: Job[] = [];
  const now = Date.now();

  const sales = await q.query<Row>("select * from sales");
  for (const s of sales) {
    jobs.push({
      at: iso(s.at),
      run: async () => {
        const [m] = await machinesForInvoice(q, [s.machine_id as string]);
        if (!m) return;
        const id = await createInvoice(q, {
          kind: "shop",
          refId: s.id as string,
          refCode: s.code as string,
          date: iso(s.at),
          buyer: { name: s.customer as string, phone: s.phone as string, state: settings.state, termsDays: 0 },
          items: [{ machine: m, amount: Number(s.price) }],
          byName: (s.by_name as string) ?? undefined,
          settings,
        });
        const modes: PaymentMode[] = ["Cash", "UPI", "UPI", "Card"];
        await addPayment(q, { invoiceId: id, amount: Number(s.price), mode: modes[Number(String(s.code).slice(-1)) % 4], at: iso(s.at), byName: (s.by_name as string) ?? undefined });
      },
    });
  }

  const orders = await q.query<Row>("select * from orders where status = 'dispatched'");
  const buyers = await listBuyers(q);
  for (const o of orders) {
    const at = iso(o.dispatched_at ?? o.created_at);
    jobs.push({
      at,
      run: async () => {
        const items = await q.query<{ machine_id: string }>("select machine_id from order_items where order_id = $1", [o.id]);
        const ms = await machinesForInvoice(q, items.map((i) => i.machine_id));
        const b = buyers.find((x) => x.name === o.buyer) ?? { name: o.buyer as string, state: settings.state, termsDays: 30 };
        const id = await createInvoice(q, {
          kind: "order",
          refId: o.id as string,
          refCode: o.code as string,
          date: at,
          buyer: b,
          items: ms.map((m) => ({ machine: m, amount: Number(o.unit_price) })),
          settings,
        });
        const total = ms.length * Number(o.unit_price);
        const age = (now - new Date(at).getTime()) / 86_400_000;
        // older orders are fully paid; recent ones partly paid, so "Money to collect" has real examples
        if (age > 50) {
          await addPayment(q, { invoiceId: id, amount: total, mode: "Bank transfer", reference: `NEFT ${String(o.code).replace("BO-", "")}`, at: new Date(new Date(at).getTime() + b.termsDays * 0.8 * 86_400_000).toISOString() });
        } else if (age > 25) {
          await addPayment(q, { invoiceId: id, amount: Math.round(total * 0.6), mode: "Bank transfer", reference: "Part payment", at: new Date(new Date(at).getTime() + 10 * 86_400_000).toISOString() });
        } else if (age > 8) {
          await addPayment(q, { invoiceId: id, amount: Math.round(total * 0.3), mode: "Bank transfer", reference: "Advance", at: at });
        }
      },
    });
  }

  jobs.sort((a, b) => a.at.localeCompare(b.at));
  for (const j of jobs) await j.run();
}

export async function ensureBilling(db: Db) {
  const rows = await db.query<{ n: number }>("select count(*)::int as n from invoices");
  const hasSettings = await db.query("select 1 from settings where key = 'business'");
  if (rows[0].n > 0 && hasSettings.length) return;
  await db.tx((q) => backfillBilling(q));
}
