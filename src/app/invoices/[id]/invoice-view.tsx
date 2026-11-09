"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, IndianRupee, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { useStore } from "@/lib/data/store";
import { invoiceMoney } from "@/lib/data/selectors";
import { can } from "@/lib/roles";
import { rupeesInWords, stateCode } from "@/lib/gst";
import { Button } from "@/components/ui/button";
import { RecordPayment } from "@/components/record-payment";
import { MoneyPill } from "@/components/money-pill";
import { dateTime, rupees, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Invoice, InvoiceLine } from "@/lib/data/types";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** Same model, spec and price → one row with quantity and the serial numbers listed under it. */
function groupLines(lines: InvoiceLine[]) {
  const map = new Map<string, { description: string; hsn: string; rate: number; serials: string[] }>();
  for (const l of lines) {
    const key = `${l.description}|${l.amount}`;
    const g = map.get(key) ?? { description: l.description, hsn: l.hsn, rate: l.amount, serials: [] };
    g.serials.push(l.serial);
    map.set(key, g);
  }
  return [...map.values()];
}

export function InvoiceView({ id }: { id: string }) {
  const inv = useStore((s) => s.invoices.find((i) => i.id === id));
  const payments = useStore((s) => s.payments);
  const settings = useStore((s) => s.settings);
  const role = useStore((s) => s.user?.role);
  const sale = useStore((s) => (inv?.kind === "shop" ? s.sales.find((x) => x.id === inv.refId) : undefined));
  const [paying, setPaying] = useState(false);

  const m = useMemo(() => (inv ? invoiceMoney(inv, payments) : null), [inv, payments]);
  const myPayments = payments.filter((p) => p.invoiceId === id);

  if (!inv || !settings || !m)
    return (
      <div className="rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-16 text-center">
        <p className="font-display text-xl font-bold">Invoice not found</p>
        <p className="mt-1 text-ink-2">It may belong to a big order, which only the owner and manager can see.</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/invoices">All invoices</Link>
        </Button>
      </div>
    );

  const groups = groupLines(inv.lines);
  const tax = inv.cgst + inv.sgst + inv.igst;
  const margin = inv.scheme === "margin";
  const warrantyMonths = sale?.warrantyMonths ?? settings.warrantyMonths;
  const warrantyUntil = new Date(new Date(inv.date).getTime() + warrantyMonths * 30 * 86_400_000);

  return (
    <div>
      {/* Toolbar (not printed) */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost">
          <Link href="/invoices">
            <ArrowLeft /> All invoices
          </Link>
        </Button>
        <MoneyPill status={m.status} overdueDays={m.overdueDays} />
        <div className="ml-auto flex flex-wrap gap-2">
          {inv.kind === "order" && (
            <Button variant="outline" onClick={() => serialAnnexure(inv)}>
              <Download /> Serial list (Excel)
            </Button>
          )}
          {m.balance > 0.5 && can(role, "billing") && (
            <Button variant="outline" onClick={() => setPaying(true)}>
              <IndianRupee /> Record payment
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print / save as PDF
          </Button>
        </div>
      </div>

      {!settings.gstin && can(role, "settings") && (
        <div className="no-print mb-4 flex items-start gap-3 rounded-2xl bg-st-checking-bg p-4 text-sm text-st-checking">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            Your GSTIN is not set, so this prints as a bill without it.{" "}
            <Link href="/settings" className="font-semibold underline">
              Add it in Settings
            </Link>{" "}
            — every invoice will show it from then on.
          </p>
        </div>
      )}

      <RecordPayment invoice={paying ? inv : null} onClose={() => setPaying(false)} />

      {/* The invoice — A4 paper look on screen, clean on print */}
      <article className="print-invoice mx-auto max-w-[860px] rounded-2xl border border-line bg-white p-6 text-[13px] leading-relaxed text-ink shadow-[0_20px_60px_-30px_rgba(15,42,38,.25)] sm:p-10">
        <header className="flex flex-col gap-5 border-b-2 border-ink pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-[28px] font-bold leading-none">{settings.businessName}</p>
            <p className="mt-2 max-w-sm text-ink-2">{settings.address}</p>
            <p className="text-ink-2">
              {settings.phone && <>Phone {settings.phone} · </>}
              {settings.state} (State code {stateCode(settings.state)})
            </p>
            {settings.gstin && <p className="mt-1 font-semibold">GSTIN: {settings.gstin}</p>}
          </div>
          <div className="sm:text-right">
            <p className="font-display text-[20px] font-bold">{settings.gstin ? "Tax invoice" : "Invoice"}</p>
            {margin && <p className="text-[12px] font-semibold text-ink-2">Second-hand goods — margin scheme</p>}
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 sm:justify-end">
              <dt className="text-ink-3">Invoice no.</dt>
              <dd className="font-mono font-semibold">{inv.number}</dd>
              <dt className="text-ink-3">Date</dt>
              <dd className="font-semibold">{longDate(inv.date)}</dd>
              {inv.kind === "order" && (
                <>
                  <dt className="text-ink-3">Due by</dt>
                  <dd className="font-semibold">{longDate(inv.dueDate)}</dd>
                </>
              )}
              <dt className="text-ink-3">{inv.kind === "order" ? "Order" : "Sale"}</dt>
              <dd className="font-semibold">{inv.refCode}</dd>
            </dl>
          </div>
        </header>

        <section className="grid gap-5 border-b border-line py-5 sm:grid-cols-2">
          <div>
            <p className="text-[11.5px] font-semibold text-ink-3">Bill to</p>
            <p className="mt-0.5 text-[15px] font-bold">{inv.buyerName}</p>
            {inv.buyerAddress && <p className="text-ink-2">{inv.buyerAddress}</p>}
            {inv.buyerPhone && <p className="text-ink-2">Phone {inv.buyerPhone}</p>}
            {inv.buyerGstin ? <p className="font-semibold">GSTIN: {inv.buyerGstin}</p> : inv.kind === "order" && <p className="text-ink-3">GSTIN: not given</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11.5px] font-semibold text-ink-3">Place of supply</p>
            <p className="mt-0.5 font-semibold">
              {inv.buyerState} ({stateCode(inv.buyerState)})
            </p>
            <p className="text-ink-2">{inv.intra ? "Within the state — CGST + SGST" : "Other state — IGST"}</p>
          </div>
        </section>

        <table className="mt-5 w-full text-left">
          <thead>
            <tr className="border-b-2 border-ink text-[11.5px] text-ink-2">
              <th className="w-8 py-2 font-semibold">#</th>
              <th className="py-2 font-semibold">Item</th>
              <th className="w-14 py-2 pl-2 text-center font-semibold">HSN</th>
              <th className="w-12 py-2 pl-3 text-right font-semibold">Qty</th>
              <th className="w-28 py-2 pl-4 text-right font-semibold">Rate</th>
              <th className="w-32 py-2 pl-4 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={i} className="border-b border-line-soft align-top">
                <td className="py-2.5 text-ink-3">{i + 1}</td>
                <td className="py-2.5 pr-3">
                  <p className="font-semibold">{g.description}</p>
                  <p className="mt-0.5 font-mono text-[11px] leading-snug text-ink-2">
                    {g.serials.length > 12 ? `${g.serials.slice(0, 12).join(", ")} … +${g.serials.length - 12} more (see serial list)` : `S/N ${g.serials.join(", ")}`}
                  </p>
                </td>
                <td className="py-2.5 pl-2 text-center align-top">{g.hsn}</td>
                <td className="py-2.5 pl-3 text-right align-top tabular-nums whitespace-nowrap">{g.serials.length}</td>
                <td className="py-2.5 pl-4 text-right align-top tabular-nums whitespace-nowrap">{money(g.rate)}</td>
                <td className="py-2.5 pl-4 text-right align-top font-semibold tabular-nums whitespace-nowrap">{money(g.rate * g.serials.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5 grid gap-6 sm:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink-3">Amount in words</p>
              <p className="font-semibold">{rupeesInWords(inv.total)}</p>
            </div>
            {margin ? (
              <p className="rounded-lg bg-mist px-3 py-2 text-[12px] text-ink-2">
                Supply of second-hand goods under the margin scheme, Rule 32(5) of the CGST Rules, 2017. GST is paid on the margin; input tax credit
                is not available to the buyer on this invoice.
              </p>
            ) : (
              <p className="text-[12px] text-ink-3">Prices include GST at {inv.rate}%.</p>
            )}
            {inv.kind === "shop" && warrantyMonths > 0 && (
              <p className="text-[12px]">
                <b>Warranty:</b> {warrantyMonths} months, until {longDate(warrantyUntil.toISOString())}.
              </p>
            )}
            {settings.invoiceNote && <p className="text-[12px] text-ink-2">{settings.invoiceNote}</p>}
            {settings.bankDetails && (
              <div>
                <p className="text-[11.5px] font-semibold text-ink-3">Pay to</p>
                <p className="whitespace-pre-line text-[12px]">{settings.bankDetails}</p>
              </div>
            )}
          </div>

          <dl className="space-y-1.5 self-start">
            {!margin && (
              <>
                <Line label="Taxable value" value={money(inv.taxable)} />
                {inv.intra ? (
                  <>
                    <Line label={`CGST @ ${inv.rate / 2}%`} value={money(inv.cgst)} />
                    <Line label={`SGST @ ${inv.rate / 2}%`} value={money(inv.sgst)} />
                  </>
                ) : (
                  <Line label={`IGST @ ${inv.rate}%`} value={money(inv.igst)} />
                )}
              </>
            )}
            <div className="flex items-baseline justify-between border-t-2 border-ink pt-2">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-[22px] font-bold tabular-nums">{money(inv.total)}</dd>
            </div>
            <Line label="Received" value={money(m.paid)} />
            <Line label="Balance due" value={money(m.balance)} strong={m.balance > 0.5} />
          </dl>
        </section>

        <footer className="mt-10 flex items-end justify-between gap-6 border-t border-line pt-4 text-[12px] text-ink-3">
          <p>This is a computer-generated invoice.</p>
          <div className="text-right">
            <div className="mb-1 h-10" />
            <p className="font-semibold text-ink">For {settings.businessName}</p>
            <p>Authorised signatory</p>
          </div>
        </footer>
      </article>

      {/* For the owner's eyes only (not printed) */}
      <div className="no-print mx-auto mt-5 grid max-w-[860px] gap-4 sm:grid-cols-2">
        {margin && can(role, "viewMoney") && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-base font-bold">GST working (not printed)</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Line label="Margin (selling − buying price)" value={money(inv.lines.reduce((s, l) => s + Math.max(0, l.amount - (l.purchase ?? 0)), 0))} />
              <Line label="Taxable value of the margin" value={money(inv.taxable)} />
              {inv.intra ? (
                <>
                  <Line label={`CGST @ ${inv.rate / 2}%`} value={money(inv.cgst)} />
                  <Line label={`SGST @ ${inv.rate / 2}%`} value={money(inv.sgst)} />
                </>
              ) : (
                <Line label={`IGST @ ${inv.rate}%`} value={money(inv.igst)} />
              )}
              <Line label="GST payable on this invoice" value={money(tax)} strong />
            </dl>
          </section>
        )}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-base font-bold">Payments received</h2>
          {myPayments.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Nothing received yet. Due by {shortDate(inv.dueDate)}.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft text-sm">
              {myPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">{p.mode}</span>
                    {p.reference && <span className="text-ink-3"> · {p.reference}</span>}
                    <span className="block text-[12.5px] text-ink-3">
                      {dateTime(p.at)}
                      {p.by && ` · ${p.by}`}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{rupees(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "font-bold text-ink" : "font-medium")}>{value}</dd>
    </div>
  );
}

function serialAnnexure(inv: Invoice) {
  const rows = inv.lines.map((l, i) => ({ "#": i + 1, Serial: l.serial, Item: l.description, HSN: l.hsn, "Price (₹)": l.amount }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Serials");
  XLSX.writeFile(wb, `${inv.number.replace(/\//g, "-")}-serials.xlsx`);
}
