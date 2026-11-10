"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, HandCoins, Pencil, Phone } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { owedToSuppliers } from "@/lib/data/selectors";
import type { Batch, Supplier } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { MoneyPill } from "@/components/money-pill";
import { PaySupplier, SupplierForm } from "@/components/supplier-forms";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { rupees, rupeesShort, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function SuppliersPage() {
  const batches = useStore((s) => s.batches);
  const payments = useStore((s) => s.supplierPayments);
  const suppliers = useStore((s) => s.suppliers);
  const [paying, setPaying] = useState<Batch | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showPaid, setShowPaid] = useState<Record<string, boolean>>({});

  const d = useMemo(() => owedToSuppliers(batches, payments), [batches, payments]);
  const monthAgo = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const paid30 = payments.filter((p) => p.at > monthAgo).reduce((s, p) => s + p.amount, 0);
  const owing = d.rows.filter((r) => r.balance > 0.5);
  const settled = d.rows.filter((r) => r.balance <= 0.5);

  return (
    <div>
      <PageHeader title="Suppliers" sub="What you owe the people you buy stock from, overdue first. Record each payment you make." />

      <section className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface sm:grid-cols-3">
        <Figure label="You still owe" value={rupeesShort(d.total)} note={`${owing.length} supplier${owing.length === 1 ? "" : "s"}`} />
        <Figure label="Overdue" value={rupeesShort(d.overdue)} note="Past the date you agreed to pay" danger={d.overdue > 0} />
        <Figure label="Paid in 30 days" value={rupeesShort(paid30)} note="To all suppliers" />
      </section>

      {d.rows.length === 0 && (
        <div className="mt-5 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">No suppliers yet</p>
          <p className="mt-1 text-ink-2">
            They appear here when you <Link href="/add" className="font-semibold text-brand">add a purchase batch</Link>.
          </p>
        </div>
      )}
      {d.rows.length > 0 && owing.length === 0 && (
        <div className="mt-5 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-st-ready" />
          <p className="font-display mt-2 text-lg font-bold">Every supplier is paid</p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {[...owing, ...settled].map((r) => {
          const sup = suppliers.find((s) => s.name === r.supplier);
          const open = r.batches.filter((b) => b.balance > 0.5);
          const done = r.batches.filter((b) => b.balance <= 0.5);
          const list = showPaid[r.supplier] ? r.batches : open;
          return (
            <section
              key={r.supplier}
              className={cn("rounded-[var(--radius-panel)] border bg-surface p-5 sm:p-6", r.overdue > 0 ? "border-2 border-st-scrap/50" : "border-line")}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold">{r.supplier}</h2>
                  <p className="text-sm text-ink-2">
                    {sup ? `${sup.kind} · ${sup.termsDays ? `you pay in ${sup.termsDays} days` : "paid on pickup"}` : "Supplier"}
                    {sup?.phone && (
                      <a href={`tel:${sup.phone}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand">
                        <Phone className="size-3.5" /> {sup.phone}
                      </a>
                    )}
                    {sup && (
                      <button onClick={() => setEditing(sup)} className="-my-2 ml-1 inline-flex min-h-11 items-center gap-1 px-1.5 text-ink-3 hover:text-brand">
                        <Pencil className="size-3.5" /> Edit
                      </button>
                    )}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-3">
                    Bought {rupees(r.bought)} in {r.batches.length} batch{r.batches.length === 1 ? "" : "es"} · paid {rupees(r.paid)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className={cn("font-display text-[26px] font-bold leading-none", r.balance <= 0.5 && "text-st-ready")}>
                    {r.balance > 0.5 ? rupees(r.balance) : "Paid up"}
                  </p>
                  {r.overdue > 0 && <p className="mt-1 text-sm font-semibold text-st-scrap">{rupees(r.overdue)} overdue</p>}
                </div>
              </div>

              {list.length > 0 && (
                <ul className="mt-4 divide-y divide-line-soft rounded-2xl border border-line">
                  {list.map((b) => (
                    <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <Link href="/batches" className="min-w-0 flex-1 hover:underline">
                        <p className="font-semibold">
                          Batch <span className="font-mono">{b.code}</span>
                          <span className="font-normal text-ink-3">
                            {" "}· {b.count} machines{b.billNo ? ` · bill ${b.billNo}` : ""}
                          </span>
                        </p>
                        <p className="text-[13px] text-ink-3">
                          {rupees(b.totalCost)} bought {shortDate(b.date)} · {rupees(b.paid)} paid
                          {b.balance > 0.5 ? ` · pay by ${shortDate(b.due)}` : ""}
                        </p>
                      </Link>
                      <div className="flex items-center gap-3">
                        <MoneyPill status={b.status} overdueDays={b.overdueDays} />
                        <span className="w-24 text-right font-semibold tabular-nums">{b.balance > 0.5 ? rupees(b.balance) : "—"}</span>
                        {b.balance > 0.5 ? (
                          <Button size="sm" onClick={() => setPaying(b)}>
                            <HandCoins /> Pay
                          </Button>
                        ) : (
                          <span className="w-[74px]" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {done.length > 0 && open.length > 0 && (
                <button
                  onClick={() => setShowPaid({ ...showPaid, [r.supplier]: !showPaid[r.supplier] })}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-3 hover:text-brand"
                >
                  <ChevronDown className={cn("size-4 transition", showPaid[r.supplier] && "rotate-180")} />
                  {showPaid[r.supplier] ? "Hide" : "Show"} {done.length} paid batch{done.length === 1 ? "" : "es"}
                </button>
              )}
              {open.length === 0 && !showPaid[r.supplier] && (
                <button
                  onClick={() => setShowPaid({ ...showPaid, [r.supplier]: true })}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-3 hover:text-brand"
                >
                  <ChevronDown className="size-4" /> Show {done.length} batch{done.length === 1 ? "" : "es"}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <PaySupplier batch={paying} onClose={() => setPaying(null)} />
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit supplier" side="center">
        {editing && <SupplierForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function Figure({ label, value, note, danger }: { label: string; value: string; note: string; danger?: boolean }) {
  return (
    <div className="border-b border-line-soft p-5 last:border-0 sm:border-b-0 sm:border-r sm:p-6 sm:last:border-r-0">
      <p className="text-[13.5px] font-semibold text-ink-2">{label}</p>
      <p className={cn("font-display mt-2 text-[30px] font-bold leading-none", danger && "text-st-scrap")}>{value}</p>
      <p className="mt-2 text-[13px] text-ink-3">{note}</p>
    </div>
  );
}
