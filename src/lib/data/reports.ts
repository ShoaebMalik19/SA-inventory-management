import type { Batch, Invoice, Machine, Payment, ReturnRecord, SupplierPayment } from "./types";
import { inStock } from "./selectors";

/** Monthly numbers for the Reports screen. Sales come from the GST bills (cancelled bills left out). */

export type MonthKey = string; // "2026-11"
export const monthKey = (iso: string) => {
  const d = new Date(iso);
  // the shop works in Indian time
  const ist = new Date(d.getTime() + 5.5 * 3_600_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (k: MonthKey) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
export const prevMonth = (k: MonthKey) => {
  const [y, m] = k.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const dayOfMonth = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).getUTCDate();

export type SoldLine = { at: string; kind: "shop" | "order"; machineId: string; serial: string; label: string; spec: string; price: number; cost: number; profit: number; by?: string; buyer: string };

export function soldLines(invoices: Invoice[], machines: Machine[]): SoldLine[] {
  const byId = new Map(machines.map((m) => [m.id, m]));
  const out: SoldLine[] = [];
  for (const inv of invoices) {
    if (inv.cancelledAt) continue;
    for (const l of inv.lines) {
      const m = byId.get(l.machineId);
      const cost = (l.purchase ?? m?.cost ?? 0) + (m?.repairCost ?? 0);
      out.push({
        at: inv.date,
        kind: inv.kind,
        machineId: l.machineId,
        serial: l.serial,
        label: m ? `${m.brand} ${m.model}` : l.description.split(",")[0],
        spec: m ? `${m.cpu.replace("Core ", "")} ${m.gen}th · ${m.ram}/${m.storage} GB` : "",
        price: l.amount,
        cost,
        profit: l.amount - cost,
        by: inv.by,
        buyer: inv.buyerName,
      });
    }
  }
  return out;
}

export function availableMonths(invoices: Invoice[], batches: Batch[]): MonthKey[] {
  const set = new Set<MonthKey>([monthKey(new Date().toISOString())]);
  invoices.forEach((i) => set.add(monthKey(i.date)));
  batches.forEach((b) => set.add(monthKey(b.date)));
  return [...set].sort().reverse();
}

function totals(lines: SoldLine[]) {
  const sales = lines.reduce((s, l) => s + l.price, 0);
  const profit = lines.reduce((s, l) => s + l.profit, 0);
  return { count: lines.length, sales, profit, perMachine: lines.length ? profit / lines.length : 0, margin: sales ? (profit / sales) * 100 : 0 };
}

export function monthReport(
  k: MonthKey,
  d: { invoices: Invoice[]; payments: Payment[]; machines: Machine[]; batches: Batch[]; supplierPayments: SupplierPayment[]; returns: ReturnRecord[] },
) {
  const all = soldLines(d.invoices, d.machines);
  const lines = all.filter((l) => monthKey(l.at) === k);
  // a month still running is compared with the same days of last month, so the arrows are fair
  const running = k === monthKey(new Date().toISOString());
  const today = dayOfMonth(new Date().toISOString());
  const prev = all.filter((l) => monthKey(l.at) === prevMonth(k) && (!running || dayOfMonth(l.at) <= today));
  const t = totals(lines);
  const p = totals(prev);

  // weeks of the month: 1–7, 8–14, 15–21, 22–28, 29+
  const weeks = [0, 1, 2, 3, 4].map((w) => {
    const ls = lines.filter((l) => Math.min(4, Math.floor((dayOfMonth(l.at) - 1) / 7)) === w);
    return { label: w === 4 ? "29–31" : `${w * 7 + 1}–${w * 7 + 7}`, ...totals(ls) };
  });

  const shop = totals(lines.filter((l) => l.kind === "shop"));
  const order = totals(lines.filter((l) => l.kind === "order"));

  // GST on the month's bills
  const bills = d.invoices.filter((i) => monthKey(i.date) === k);
  const live = bills.filter((i) => !i.cancelledAt);
  const credit = d.invoices.filter((i) => i.cancelledAt && monthKey(i.cancelledAt) === k);
  const gst = {
    bills: live.length,
    value: live.reduce((s, i) => s + i.total, 0),
    taxable: live.reduce((s, i) => s + i.taxable, 0),
    cgst: live.reduce((s, i) => s + i.cgst, 0),
    sgst: live.reduce((s, i) => s + i.sgst, 0),
    igst: live.reduce((s, i) => s + i.igst, 0),
    creditNotes: credit.length,
    creditValue: credit.reduce((s, i) => s + i.total, 0),
    b2b: live.filter((i) => i.buyerGstin).length,
  };

  // money in and out
  const liveIds = new Set(d.invoices.filter((i) => !i.cancelledAt).map((i) => i.id));
  const collected = d.payments.filter((x) => liveIds.has(x.invoiceId) && monthKey(x.at) === k).reduce((s, x) => s + x.amount, 0);
  const paidSuppliers = d.supplierPayments.filter((x) => monthKey(x.at) === k).reduce((s, x) => s + x.amount, 0);
  const boughtBatches = d.batches.filter((b) => monthKey(b.date) === k);
  const bought = { batches: boughtBatches.length, machines: boughtBatches.reduce((s, b) => s + b.count, 0), cost: boughtBatches.reduce((s, b) => s + b.totalCost, 0) };

  // best sellers by model + spec
  const models = new Map<string, { label: string; spec: string; count: number; sales: number; profit: number }>();
  for (const l of lines) {
    const key = `${l.label}|${l.spec}`;
    const r = models.get(key) ?? { label: l.label, spec: l.spec, count: 0, sales: 0, profit: 0 };
    r.count++;
    r.sales += l.price;
    r.profit += l.profit;
    models.set(key, r);
  }
  const best = [...models.values()].sort((a, b) => b.count - a.count || b.profit - a.profit).slice(0, 8);

  // who sold
  const people = new Map<string, { name: string; count: number; sales: number }>();
  for (const l of lines) {
    const n = l.by ?? "—";
    const r = people.get(n) ?? { name: n, count: 0, sales: 0 };
    r.count++;
    r.sales += l.price;
    people.set(n, r);
  }
  // who checked machines (from each machine's history)
  const checkers = new Map<string, number>();
  for (const m of d.machines)
    for (const h of m.history) if ((h.kind === "checked" || h.kind === "repair") && h.by && monthKey(h.at) === k) checkers.set(h.by, (checkers.get(h.by) ?? 0) + 1);

  const returns = d.returns.filter((r) => monthKey(r.at) === k);
  const reasons = new Map<string, number>();
  returns.forEach((r) => {
    const why = r.reason.split(" — ")[0];
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
  });

  return {
    month: k,
    ...t,
    prev: p,
    compareLabel: running ? `vs 1–${today} ${monthLabel(prevMonth(k)).split(" ")[0]}` : "vs last month",
    weeks,
    shop,
    order,
    gst,
    collected,
    paidSuppliers,
    bought,
    best,
    sellers: [...people.values()].sort((a, b) => b.sales - a.sales),
    checkers: [...checkers.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    returns: { count: returns.length, refunds: returns.reduce((s, r) => s + r.refund, 0), reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]) },
    lines,
  };
}

const AGE_BUCKETS = [
  { label: "0–15 days", max: 15 },
  { label: "16–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "61–90 days", max: 90 },
  { label: "Over 90 days", max: Infinity },
];

/** How old the stock is right now, and the slowest machines. */
export function stockAge(machines: Machine[]) {
  const now = Date.now();
  const stock = machines.filter(inStock).map((m) => ({ m, days: Math.floor((now - new Date(m.addedAt).getTime()) / 86_400_000) }));
  const buckets = AGE_BUCKETS.map((b, i) => {
    const min = i ? AGE_BUCKETS[i - 1].max + 1 : 0;
    const xs = stock.filter((s) => s.days >= min && s.days <= b.max);
    return { label: b.label, count: xs.length, cost: xs.reduce((s, x) => s + x.m.cost + x.m.repairCost, 0), old: i >= 3 };
  });
  const slow = stock
    .filter((s) => s.m.stage === "ready")
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);
  return { buckets, total: stock.length, slow };
}

/** How good each supplier's machines turn out (all time). */
export function supplierQuality(machines: Machine[], batches: Batch[]) {
  const bySupplier = new Map<string, { supplier: string; machines: number; scrap: number; repaired: number; sold: number; profit: number }>();
  const batch = new Map(batches.map((b) => [b.id, b]));
  for (const m of machines) {
    const b = batch.get(m.batchId);
    if (!b) continue;
    const r = bySupplier.get(b.supplier) ?? { supplier: b.supplier, machines: 0, scrap: 0, repaired: 0, sold: 0, profit: 0 };
    r.machines++;
    if (m.stage === "scrap") r.scrap++;
    if (m.history.some((h) => h.kind === "repair")) r.repaired++;
    if (m.stage === "sold" && m.soldPrice) {
      r.sold++;
      r.profit += m.soldPrice - m.cost - m.repairCost;
    }
    bySupplier.set(b.supplier, r);
  }
  return [...bySupplier.values()]
    .filter((r) => r.machines >= 5)
    .map((r) => ({ ...r, scrapRate: (r.scrap / r.machines) * 100, repairRate: (r.repaired / r.machines) * 100, profitEach: r.sold ? r.profit / r.sold : 0 }))
    .sort((a, b) => b.machines - a.machines);
}
