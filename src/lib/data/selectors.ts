import type { Batch, Grade, Invoice, Machine, Payment, Requirement, Stage } from "./types";
import { specKey, STAGE_ORDER } from "./types";

const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2 };

/** A machine fits a requirement if it meets or beats every minimum. */
export function fits(m: Machine, need: Omit<Requirement, "qty">) {
  return (
    m.type === need.type &&
    m.cpu === need.cpu &&
    m.gen >= need.minGen &&
    m.ram >= need.ram &&
    m.storage >= need.storage &&
    m.grade !== null &&
    GRADE_RANK[m.grade] <= GRADE_RANK[need.grade]
  );
}

/**
 * Auto-pick for big orders: exact matches first (don't give away better machines),
 * then the oldest stock first (clears aging stock).
 */
export function pickForRequirement(
  machines: Machine[],
  need: Requirement,
  extraFilter: (m: Machine) => boolean = () => true,
) {
  // MacBooks are sold one by one at the shop, never mixed into bulk Windows orders
  const candidates = machines.filter((m) => m.stage === "ready" && m.brand !== "Apple" && fits(m, need) && extraFilter(m));
  const overSpec = (m: Machine) =>
    (m.gen - need.minGen) * 3 +
    (m.ram > need.ram ? 2 : 0) +
    (m.storage > need.storage ? 1 : 0) +
    (GRADE_RANK[need.grade] - GRADE_RANK[m.grade!]) * 2;
  candidates.sort((a, b) => overSpec(a) - overSpec(b) || a.addedAt.localeCompare(b.addedAt));
  const picked = candidates.slice(0, need.qty);
  return { picked, available: candidates.length, shortBy: Math.max(0, need.qty - candidates.length) };
}

export function stageCounts(machines: Machine[]) {
  const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
  for (const m of machines) counts[m.stage]++;
  return counts;
}

export const inStock = (m: Machine) => m.stage !== "sold" && m.stage !== "scrap";

export function stockValue(machines: Machine[]) {
  let cost = 0;
  let asking = 0;
  for (const m of machines) {
    if (!inStock(m)) continue;
    cost += m.cost + m.repairCost;
    asking += m.price;
  }
  return { cost, asking };
}

/** Ready-to-sell machines older than `days` — money stuck on the shelf. */
export function agingStock(machines: Machine[], days = 60) {
  const cutoff = Date.now() - days * 86_400_000;
  return machines.filter((m) => m.stage === "ready" && new Date(m.addedAt).getTime() < cutoff);
}

export function salesInLast(machines: Machine[], days: number) {
  const cutoff = Date.now() - days * 86_400_000;
  let revenue = 0;
  let profit = 0;
  let units = 0;
  for (const m of machines) {
    if (m.stage !== "sold" || !m.soldPrice) continue;
    if (new Date(m.updatedAt).getTime() < cutoff) continue;
    units++;
    revenue += m.soldPrice;
    profit += m.soldPrice - m.cost - m.repairCost;
  }
  return { revenue, profit, units };
}

export type SpecRow = {
  key: string;
  type: Machine["type"];
  cpu: string;
  gen: number;
  ram: number;
  storage: number;
  A: number;
  B: number;
  C: number;
  total: number;
  models: string[];
  avgPrice: number;
};

/** Ready Stock: count of ready machines by spec × grade. */
export function specMatrix(machines: Machine[]): SpecRow[] {
  const rows = new Map<string, SpecRow & { priceSum: number; modelSet: Set<string> }>();
  for (const m of machines) {
    if (m.stage !== "ready" || !m.grade) continue;
    const key = specKey(m);
    let row = rows.get(key);
    if (!row) {
      row = {
        key, type: m.type, cpu: m.cpu, gen: m.gen, ram: m.ram, storage: m.storage,
        A: 0, B: 0, C: 0, total: 0, models: [], avgPrice: 0, priceSum: 0, modelSet: new Set(),
      };
      rows.set(key, row);
    }
    row[m.grade]++;
    row.total++;
    row.priceSum += m.price;
    row.modelSet.add(`${m.brand} ${m.model}`);
  }
  return [...rows.values()]
    .map(({ priceSum, modelSet, ...r }) => ({ ...r, avgPrice: priceSum / r.total, models: [...modelSet] }))
    .sort((a, b) => b.total - a.total);
}

export function batchSummary(batch: Batch, machines: Machine[]) {
  const ms = machines.filter((m) => m.batchId === batch.id);
  let revenue = 0;
  let repair = 0;
  let sold = 0;
  let scrap = 0;
  let unsoldAsking = 0;
  for (const m of ms) {
    repair += m.repairCost;
    if (m.stage === "sold") {
      sold++;
      revenue += m.soldPrice ?? 0;
    } else if (m.stage === "scrap") scrap++;
    // not graded yet → estimate at a typical grade-B markup
    else unsoldAsking += m.price || Math.round((m.cost + m.repairCost) * 1.27);
  }
  const spent = batch.totalCost + repair;
  return { machines: ms, revenue, repair, sold, scrap, spent, profitSoFar: revenue - spent, unsoldAsking, counts: stageCounts(ms) };
}

export const specLabel = (s: { cpu: string; gen: number; ram: number; storage: number }) =>
  `${s.cpu.replace("Core ", "")} ${s.gen}th gen · ${s.ram} GB · ${s.storage} GB`;

export const isOlderThan = (m: Machine, days: number) => new Date(m.addedAt).getTime() < Date.now() - days * 86_400_000;

/* ---------------- Money ---------------- */


export type InvoiceStatus = "paid" | "part" | "unpaid" | "overdue";

export function invoiceMoney(inv: Invoice, payments: Payment[]) {
  const paid = Math.round(payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const balance = Math.max(0, Math.round((inv.total - paid) * 100) / 100);
  const overdueDays = balance > 0.5 ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000) : 0;
  const status: InvoiceStatus = balance <= 0.5 ? "paid" : overdueDays > 0 ? "overdue" : paid > 0 ? "part" : "unpaid";
  return { paid, balance, overdueDays: Math.max(0, overdueDays), status };
}

/** Money still to come in, per buyer, oldest due first. */
export function moneyToCollect(invoices: Invoice[], payments: Payment[]) {
  const byBuyer = new Map<string, { buyer: string; balance: number; overdue: number; oldestDue: string; invoices: (Invoice & ReturnType<typeof invoiceMoney>)[] }>();
  for (const inv of invoices) {
    const m = invoiceMoney(inv, payments);
    if (m.balance <= 0.5) continue;
    const row = byBuyer.get(inv.buyerName) ?? { buyer: inv.buyerName, balance: 0, overdue: 0, oldestDue: inv.dueDate, invoices: [] };
    row.balance += m.balance;
    if (m.status === "overdue") row.overdue += m.balance;
    if (inv.dueDate < row.oldestDue) row.oldestDue = inv.dueDate;
    row.invoices.push({ ...inv, ...m });
    byBuyer.set(inv.buyerName, row);
  }
  const rows = [...byBuyer.values()].sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
  rows.forEach((r) => r.invoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  return {
    rows,
    total: rows.reduce((s, r) => s + r.balance, 0),
    overdue: rows.reduce((s, r) => s + r.overdue, 0),
  };
}
