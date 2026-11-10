"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownRight, ArrowUpRight, Download, Printer } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { availableMonths, monthLabel, monthReport, stockAge, supplierQuality } from "@/lib/data/reports";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useUI } from "@/lib/ui-store";
import { count, rupees, rupeesShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const invoices = useStore((s) => s.invoices);
  const payments = useStore((s) => s.payments);
  const machines = useStore((s) => s.machines);
  const batches = useStore((s) => s.batches);
  const supplierPayments = useStore((s) => s.supplierPayments);
  const returns = useStore((s) => s.returns);
  const openMachine = useUI((s) => s.openMachine);

  const months = useMemo(() => availableMonths(invoices, batches), [invoices, batches]);
  const [month, setMonth] = useState(months[0]);
  const r = useMemo(
    () => monthReport(month, { invoices, payments, machines, batches, supplierPayments, returns }),
    [month, invoices, payments, machines, batches, supplierPayments, returns],
  );
  const age = useMemo(() => stockAge(machines), [machines]);
  const quality = useMemo(() => supplierQuality(machines, batches), [machines, batches]);
  const maxWeek = Math.max(1, ...r.weeks.map((w) => w.sales));
  const maxAge = Math.max(1, ...age.buckets.map((b) => b.count));

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Nothing this month" }]), name);
    sheet("Summary", [
      { Item: "Machines sold", Value: r.count },
      { Item: "Sales (₹)", Value: Math.round(r.sales) },
      { Item: "Profit (₹)", Value: Math.round(r.profit) },
      { Item: "Profit per machine (₹)", Value: Math.round(r.perMachine) },
      { Item: "Shop sales (₹)", Value: Math.round(r.shop.sales) },
      { Item: "Big orders (₹)", Value: Math.round(r.order.sales) },
      { Item: "Money collected (₹)", Value: Math.round(r.collected) },
      { Item: "Paid to suppliers (₹)", Value: Math.round(r.paidSuppliers) },
      { Item: "Stock bought (₹)", Value: Math.round(r.bought.cost) },
      { Item: "Returns", Value: r.returns.count },
      { Item: "Refunds (₹)", Value: Math.round(r.returns.refunds) },
    ]);
    sheet("GST", [
      { Item: "Bills", Value: r.gst.bills },
      { Item: "Bill value (₹)", Value: r.gst.value },
      { Item: "Taxable value (₹)", Value: r.gst.taxable },
      { Item: "CGST (₹)", Value: r.gst.cgst },
      { Item: "SGST (₹)", Value: r.gst.sgst },
      { Item: "IGST (₹)", Value: r.gst.igst },
      { Item: "Credit notes", Value: r.gst.creditNotes },
      { Item: "Credit note value (₹)", Value: r.gst.creditValue },
    ]);
    sheet("Every sale", r.lines.map((l) => ({ Date: l.at.slice(0, 10), Type: l.kind === "shop" ? "Shop" : "Big order", Serial: l.serial, Machine: l.label, Spec: l.spec, Buyer: l.buyer, Price: l.price, Cost: l.cost, Profit: l.profit, By: l.by ?? "" })));
    sheet("Best sellers", r.best.map((b) => ({ Machine: b.label, Spec: b.spec, Sold: b.count, Sales: b.sales, Profit: b.profit })));
    sheet("Stock age", age.buckets.map((b) => ({ Age: b.label, Machines: b.count, "Cost value": b.cost })));
    sheet("Suppliers", quality.map((q) => ({ Supplier: q.supplier, Machines: q.machines, "Scrap %": Math.round(q.scrapRate), "Needed repair %": Math.round(q.repairRate), "Profit per sale": Math.round(q.profitEach) })));
    XLSX.writeFile(wb, `S.A Computers report ${month}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        sub="How the month went: sales, profit, GST, how old the stock is and what sells best."
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <Download /> Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="hidden sm:inline-flex">
              <Printer /> Print
            </Button>
          </>
        }
      />

      {/* month picker: swipe sideways on a phone */}
      <div className="no-print -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {months.slice(0, 18).map((k) => (
          <button
            key={k}
            onClick={() => setMonth(k)}
            className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold", k === month ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}
          >
            {monthLabel(k)}
          </button>
        ))}
      </div>

      <h2 className="font-display text-2xl font-bold">{monthLabel(month)}</h2>

      {/* headline numbers */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Machines sold" value={count(r.count)} now={r.count} before={r.prev.count} vs={r.compareLabel} />
        <Stat label="Sales" value={rupeesShort(r.sales)} now={r.sales} before={r.prev.sales} vs={r.compareLabel} />
        <Stat label="Profit" value={rupeesShort(r.profit)} now={r.profit} before={r.prev.profit} vs={r.compareLabel} good />
        <Stat label="Profit per machine" value={rupees(r.perMachine)} now={r.perMachine} before={r.prev.perMachine} vs={r.compareLabel} sub={`${r.margin.toFixed(1)}% of the price`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Week by week" sub="Sales in each week of the month (green part = profit)">
          <div className="flex h-44 items-end gap-3">
            {r.weeks.map((w) => (
              <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[12px] font-semibold tabular-nums text-ink-2">{w.sales ? rupeesShort(w.sales) : "—"}</span>
                <div className="relative w-full overflow-hidden rounded-t-lg bg-brand/20" style={{ height: `${(w.sales / maxWeek) * 100}%`, minHeight: w.sales ? 6 : 2 }}>
                  <div className="absolute inset-x-0 bottom-0 bg-st-ready" style={{ height: `${w.sales ? Math.max(0, (w.profit / w.sales) * 100) : 0}%` }} />
                </div>
                <span className="text-[12px] text-ink-3">{w.label}</span>
                <span className="text-[11.5px] text-ink-3">{w.count} sold</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Where the sales came from">
          <Split label="Shop counter" n={r.shop.count} sales={r.shop.sales} profit={r.shop.profit} total={r.sales} color="bg-brand" />
          <Split label="Big orders" n={r.order.count} sales={r.order.sales} profit={r.order.profit} total={r.sales} color="bg-tag" />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Mini label="Money collected" value={rupeesShort(r.collected)} />
            <Mini label="Paid to suppliers" value={rupeesShort(r.paidSuppliers)} />
            <Mini label="Stock bought" value={`${count(r.bought.machines)} · ${rupeesShort(r.bought.cost)}`} />
            <Mini label="Returns" value={`${r.returns.count} · ${rupeesShort(r.returns.refunds)} back`} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Best sellers" sub="Most sold model and spec this month">
          {r.best.length ? (
            <ol className="divide-y divide-line-soft">
              {r.best.map((b, i) => (
                <li key={b.label + b.spec} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mist text-[13px] font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.label}</span>
                    <span className="block truncate text-[13px] text-ink-3">{b.spec}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold tabular-nums">{b.count} sold</span>
                    <span className="block text-[12.5px] text-st-ready">{rupees(b.profit / b.count)} profit each</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="GST for the month" sub="From the bills. Give this to the accountant for GSTR-1 / 3B.">
          <dl className="divide-y divide-line-soft text-[14.5px]">
            {[
              ["Bills made", `${count(r.gst.bills)} (${r.gst.b2b} to GST-registered buyers)`],
              ["Total bill value", rupees(r.gst.value)],
              ["Taxable value", rupees(r.gst.taxable)],
              ["CGST", rupees(r.gst.cgst)],
              ["SGST", rupees(r.gst.sgst)],
              ["IGST (other states)", rupees(r.gst.igst)],
              ["Total GST", rupees(r.gst.cgst + r.gst.sgst + r.gst.igst)],
              ["Credit notes (cancelled sales)", r.gst.creditNotes ? `${r.gst.creditNotes} · ${rupees(r.gst.creditValue)}` : "None"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2">
                <dt className="text-ink-2">{k}</dt>
                <dd className="text-right font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="How old the stock is (today)" sub={`${count(age.total)} machines in stock. Old stock ties up money — sell it first.`}>
          <div className="space-y-2.5">
            {age.buckets.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-sm">
                  <span className={cn("font-semibold", b.old && b.count && "text-st-scrap")}>{b.label}</span>
                  <span className="tabular-nums text-ink-2">
                    {count(b.count)} · {rupeesShort(b.cost)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-mist">
                  <div className={cn("h-full rounded-full", b.old ? "bg-st-scrap" : "bg-brand")} style={{ width: `${(b.count / maxAge) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {age.slow.length > 0 && (
            <>
              <p className="mt-5 text-sm font-bold">Oldest ready machines — think about a lower price</p>
              <ul className="mt-1 divide-y divide-line-soft">
                {age.slow.map(({ m, days }) => (
                  <li key={m.id}>
                    <button onClick={() => openMachine(m.id)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {m.brand} {m.model}
                        </span>
                        <span className="block truncate font-mono text-[12.5px] text-ink-3">{m.serial}</span>
                      </span>
                      <span className="text-right text-sm">
                        <span className="block font-bold text-st-scrap">{days} days</span>
                        <span className="block text-ink-3">{rupees(m.price)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Suppliers: how good their machines are" sub="All batches so far. High scrap means check their next lot before paying.">
          {quality.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-[12.5px] text-ink-3">
                    <th className="px-1 py-1.5 font-semibold">Supplier</th>
                    <th className="px-1 py-1.5 text-right font-semibold">Bought</th>
                    <th className="px-1 py-1.5 text-right font-semibold">Scrap</th>
                    <th className="px-1 py-1.5 text-right font-semibold">Repair</th>
                    <th className="px-1 py-1.5 text-right font-semibold">Profit/sale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {quality.map((q) => (
                    <tr key={q.supplier}>
                      <td className="px-1 py-2 font-semibold">{q.supplier}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{count(q.machines)}</td>
                      <td className={cn("px-1 py-2 text-right tabular-nums", q.scrapRate > 6 && "font-bold text-st-scrap")}>{q.scrapRate.toFixed(0)}%</td>
                      <td className="px-1 py-2 text-right tabular-nums">{q.repairRate.toFixed(0)}%</td>
                      <td className="px-1 py-2 text-right tabular-nums">{q.sold ? rupees(q.profitEach) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Who did the work">
          <p className="text-[13px] font-semibold text-ink-3">Sales (bills made)</p>
          <ul className="mt-1 divide-y divide-line-soft">
            {r.sellers.map((s) => (
              <li key={s.name} className="flex justify-between py-2 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="tabular-nums text-ink-2">
                  {s.count} · {rupeesShort(s.sales)}
                </span>
              </li>
            ))}
            {!r.sellers.length && <li className="py-2 text-sm text-ink-3">No sales yet.</li>}
          </ul>
          <p className="mt-4 text-[13px] font-semibold text-ink-3">Machines checked or repaired</p>
          <ul className="mt-1 divide-y divide-line-soft">
            {r.checkers.map((c) => (
              <li key={c.name} className="flex justify-between py-2 text-sm">
                <span className="font-semibold">{c.name}</span>
                <span className="tabular-nums text-ink-2">{count(c.n)}</span>
              </li>
            ))}
            {!r.checkers.length && <li className="py-2 text-sm text-ink-3">No checks yet.</li>}
          </ul>
        </Card>
        <Card title="Returns this month">
          {r.returns.count ? (
            <ul className="divide-y divide-line-soft">
              {r.returns.reasons.map(([why, n]) => (
                <li key={why} className="flex justify-between py-2 text-sm">
                  <span>{why}</span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No returns this month.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, now, before, sub, good, vs }: { label: string; value: string; now: number; before: number; sub?: string; good?: boolean; vs: string }) {
  const diff = before ? ((now - before) / Math.abs(before)) * 100 : null;
  const up = diff !== null && diff >= 0;
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className={cn("font-display mt-1 text-[24px] font-bold leading-tight tabular-nums sm:text-[28px]", good && now > 0 && "text-st-ready")}>{value}</p>
      {diff !== null ? (
        <p className={cn("mt-1 flex items-center gap-0.5 text-[12.5px] font-semibold", up ? "text-st-ready" : "text-st-scrap")}>
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(diff).toFixed(0)}% {vs}
        </p>
      ) : (
        <p className="mt-1 text-[12.5px] text-ink-3">{sub ?? "No sales last month"}</p>
      )}
      {sub && diff !== null && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {sub && <p className="text-[13px] text-ink-3">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Split({ label, n, sales, profit, total, color }: { label: string; n: number; sales: number; profit: number; total: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">
          {label} <span className="font-normal text-ink-3">· {n} machines</span>
        </span>
        <span className="tabular-nums">
          {rupeesShort(sales)} <span className="text-st-ready">(+{rupeesShort(profit)})</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-mist">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${total ? (sales / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-mist p-3">
    <p className="text-[12px] text-ink-3">{label}</p>
    <p className="font-semibold tabular-nums">{value}</p>
  </div>
);

const Empty = () => <p className="py-4 text-sm text-ink-3">Nothing this month yet.</p>;
