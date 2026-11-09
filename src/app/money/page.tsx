"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, IndianRupee, Pencil, Phone } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { moneyToCollect } from "@/lib/data/selectors";
import type { Buyer, Invoice } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { MoneyPill } from "@/components/money-pill";
import { RecordPayment } from "@/components/record-payment";
import { BuyerForm } from "@/components/buyer-form";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { rupees, rupeesShort, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function MoneyPage() {
  const invoices = useStore((s) => s.invoices);
  const payments = useStore((s) => s.payments);
  const buyers = useStore((s) => s.buyers);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Buyer | null>(null);

  const d = useMemo(() => moneyToCollect(invoices, payments), [invoices, payments]);
  const monthAgo = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const received30 = payments.filter((p) => p.at > monthAgo).reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader
        title="Money to collect"
        sub="What buyers still owe you on big orders, oldest due first. Record each payment as it comes in."
      />

      <section className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface sm:grid-cols-3">
        <Figure label="Still to collect" value={rupeesShort(d.total)} note={`${d.rows.length} buyer${d.rows.length === 1 ? "" : "s"}`} />
        <Figure label="Overdue" value={rupeesShort(d.overdue)} note="Past the agreed payment date" danger={d.overdue > 0} />
        <Figure label="Received in 30 days" value={rupeesShort(received30)} note="Shop and big orders" good />
      </section>

      {d.rows.length === 0 ? (
        <div className="mt-5 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto size-8 text-st-ready" />
          <p className="font-display mt-2 text-lg font-bold">Nobody owes you anything</p>
          <p className="mt-1 text-ink-2">Dispatched big orders show up here until they are fully paid.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {d.rows.map((r) => {
            const buyer = buyers.find((b) => b.name === r.buyer);
            return (
              <section
                key={r.buyer}
                className={cn("rounded-[var(--radius-panel)] border bg-surface p-5 sm:p-6", r.overdue > 0 ? "border-2 border-st-scrap/50" : "border-line")}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold">{r.buyer}</h2>
                    <p className="text-sm text-ink-2">
                      {buyer ? `${buyer.state} · pays in ${buyer.termsDays} days` : "Walk-in customer"}
                      {buyer?.phone && (
                        <a href={`tel:${buyer.phone}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand">
                          <Phone className="size-3.5" /> {buyer.phone}
                        </a>
                      )}
                      {buyer && (
                        <button onClick={() => setEditing(buyer)} className="ml-2 inline-flex items-center gap-1 text-ink-3 hover:text-brand">
                          <Pencil className="size-3.5" /> Edit
                        </button>
                      )}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-display text-[26px] font-bold leading-none">{rupees(r.balance)}</p>
                    {r.overdue > 0 && <p className="mt-1 text-sm font-semibold text-st-scrap">{rupees(r.overdue)} overdue</p>}
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-line-soft rounded-2xl border border-line">
                  {r.invoices.map((inv) => (
                    <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <Link href={`/invoices/${inv.id}`} className="min-w-0 flex-1 hover:underline">
                        <p className="font-semibold">
                          <span className="font-mono">{inv.number}</span> <span className="font-normal text-ink-3">· {inv.refCode}</span>
                        </p>
                        <p className="text-[13px] text-ink-3">
                          {rupees(inv.total)} billed {shortDate(inv.date)} · {rupees(inv.paid)} received · due {shortDate(inv.dueDate)}
                        </p>
                      </Link>
                      <div className="flex items-center gap-3">
                        <MoneyPill status={inv.status} overdueDays={inv.overdueDays} />
                        <span className="w-24 text-right font-semibold tabular-nums">{rupees(inv.balance)}</span>
                        <Button size="sm" onClick={() => setPaying(inv)}>
                          <IndianRupee /> Received
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <RecordPayment invoice={paying} onClose={() => setPaying(null)} />
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit buyer" side="center">
        {editing && <BuyerForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function Figure({ label, value, note, danger, good }: { label: string; value: string; note: string; danger?: boolean; good?: boolean }) {
  return (
    <div className="border-b border-line-soft p-5 last:border-0 sm:border-b-0 sm:border-r sm:p-6 sm:last:border-r-0">
      <p className="text-[13.5px] font-semibold text-ink-2">{label}</p>
      <p className={cn("font-display mt-2 text-[30px] font-bold leading-none", danger && "text-st-scrap", good && "text-st-ready")}>{value}</p>
      <p className="mt-2 text-[13px] text-ink-3">{note}</p>
    </div>
  );
}
