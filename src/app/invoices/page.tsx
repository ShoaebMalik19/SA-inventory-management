"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { useStore } from "@/lib/data/store";
import { invoiceMoney, type InvoiceStatus } from "@/lib/data/selectors";
import { can } from "@/lib/roles";
import { stateCode } from "@/lib/gst";
import { PageHeader } from "@/components/page-header";
import { MoneyPill } from "@/components/money-pill";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { count, rupees, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "all" | "due" | "overdue";

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export default function InvoicesPage() {
  const invoices = useStore((s) => s.invoices);
  const payments = useStore((s) => s.payments);
  const settings = useStore((s) => s.settings);
  const role = useStore((s) => s.user?.role);
  const [tab, setTab] = useState<Tab>("all");
  const [kind, setKind] = useState<"all" | "shop" | "order">("all");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [shown, setShown] = useState(50);

  const rows = useMemo(
    () =>
      invoices
        .map((inv) => ({ inv, m: invoiceMoney(inv, payments) }))
        .filter(({ inv, m }) => {
          if (tab === "due" && m.status === "paid") return false;
          if (tab === "overdue" && m.status !== "overdue") return false;
          if (kind !== "all" && inv.kind !== kind) return false;
          if (query && !`${inv.number} ${inv.buyerName} ${inv.refCode} ${inv.buyerPhone ?? ""}`.toLowerCase().includes(query)) return false;
          return true;
        })
        .sort((a, b) => b.inv.date.localeCompare(a.inv.date)),
    [invoices, payments, tab, kind, query],
  );

  const months = useMemo(() => [...new Set(invoices.map((i) => monthKey(i.date)))].sort().reverse(), [invoices]);
  const [month, setMonth] = useState("");

  const counts = useMemo(() => {
    let due = 0;
    let overdue = 0;
    for (const inv of invoices) {
      const s = invoiceMoney(inv, payments).status;
      if (s !== "paid") due++;
      if (s === "overdue") overdue++;
    }
    return { due, overdue };
  }, [invoices, payments]);

  /** One row per invoice, the columns an accountant needs for GST returns and Tally. */
  const exportMonth = () => {
    const list = invoices.filter((i) => monthKey(i.date) === (month || months[0])).sort((a, b) => a.date.localeCompare(b.date));
    const data = list.map((i) => ({
      "Invoice no.": i.number,
      Date: new Date(i.date).toLocaleDateString("en-IN"),
      Type: i.kind === "shop" ? "Shop sale" : "Big order",
      Buyer: i.buyerName,
      "Buyer GSTIN": i.buyerGstin ?? "",
      "Place of supply": `${stateCode(i.buyerState)}-${i.buyerState}`,
      Scheme: i.scheme === "margin" ? "Margin scheme (Rule 32(5))" : "Normal",
      HSN: "8471",
      Qty: i.lines.length,
      "Invoice value (₹)": i.total,
      "Taxable value (₹)": i.taxable,
      "CGST (₹)": i.cgst,
      "SGST (₹)": i.sgst,
      "IGST (₹)": i.igst,
      "Received (₹)": invoiceMoney(i, payments).paid,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales register");
    XLSX.writeFile(wb, `${settings?.businessName ?? "Sales"} sales register ${month || months[0]}.xlsx`);
  };

  const monthLabel = (k: string) => new Date(`${k}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title="Invoices"
        sub={
          can(role, "billing")
            ? "Every bill — made automatically when a machine is sold at the shop or a big order is dispatched."
            : "Bills for shop sales. Open one to print it again for the customer."
        }
      />

      {can(role, "billing") && months.length > 0 && (
        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
          <div className="sm:mr-auto">
            <p className="font-semibold">For your accountant</p>
            <p className="text-sm text-ink-2">Monthly sales register in Excel — GST split by invoice, ready for GSTR-1 and Tally.</p>
          </div>
          <Select value={month || months[0]} onChange={(e) => setMonth(e.target.value)} className="sm:w-52" aria-label="Month">
            {months.map((k) => (
              <option key={k} value={k}>
                {monthLabel(k)}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportMonth}>
            <Download /> Download Excel
          </Button>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no., customer, phone or order" className="h-12 rounded-2xl pl-12" />
        </div>
        {can(role, "billing") && (
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="sm:w-48" aria-label="Type">
            <option value="all">Shop & big orders</option>
            <option value="shop">Shop sales</option>
            <option value="order">Big orders</option>
          </Select>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {(
          [
            ["all", `All (${count(invoices.length)})`],
            ["due", `Money due (${count(counts.due)})`],
            ["overdue", `Overdue (${count(counts.overdue)})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3.5 py-2 text-[13.5px] font-semibold",
              tab === t ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">No invoices here</p>
          <p className="mt-1 text-ink-2">Invoices appear when you sell at the shop or dispatch a big order.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line-soft overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
          {rows.slice(0, shown).map(({ inv, m }) => (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-mist/60 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {inv.buyerName}
                    <span className="ml-2 font-normal text-ink-3">{inv.kind === "shop" ? "shop sale" : `big order · ${inv.lines.length} machines`}</span>
                  </p>
                  <p className="text-[13px] text-ink-3">
                    <span className="font-mono">{inv.number}</span> · {shortDate(inv.date)} · {inv.refCode}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <MoneyPill status={m.status as InvoiceStatus} overdueDays={m.overdueDays} />
                  <span className="w-28 text-right font-semibold tabular-nums">{rupees(inv.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown < rows.length && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setShown((s) => s + 100)}>
            Show more invoices
          </Button>
        </div>
      )}
    </div>
  );
}
