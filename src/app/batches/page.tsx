"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { can } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/data/store";
import { batchMoney, batchSummary } from "@/lib/data/selectors";
import { MoneyPill } from "@/components/money-pill";
import { STAGE_ORDER, STAGES } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { STAGE_STYLE } from "@/components/stage";
import { count, rupees, rupeesShort, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function BatchesPage() {
  const batches = useStore((s) => s.batches);
  const machines = useStore((s) => s.machines);
  const supplierPayments = useStore((s) => s.supplierPayments);
  const [open, setOpen] = useState<string | null>(null);
  const role = useStore((s) => s.user?.role);
  const removeBatch = useStore((s) => s.removeBatch);
  const remove = async (id: string, code: string) => {
    const reason = window.prompt(`Remove batch ${code} and all its machines? Only do this if it was added by mistake.\n\nWhy is it being removed?`, "Added by mistake");
    if (!reason?.trim()) return;
    const res = await removeBatch(id, reason.trim());
    if (res.ok) toast.success(`Batch ${code} removed`, { description: "It is noted in History with your name." });
    else toast.error(res.error);
  };

  const rows = useMemo(
    () =>
      batches
        .map((b) => ({ b, s: batchSummary(b, machines) }))
        .sort((x, y) => y.b.date.localeCompare(x.b.date)),
    [batches, machines],
  );

  return (
    <div>
      <PageHeader
        title="Batches"
        sub="Every purchase batch: what it cost, how much has come back, and what it will make once the rest is sold."
      />

      <ul className="space-y-3">
        {rows.map(({ b, s }) => {
          const recovered = Math.min(100, Math.round((s.revenue / Math.max(s.spent, 1)) * 100));
          const expected = s.profitSoFar + s.unsoldAsking;
          const isOpen = open === b.id;
          const owed = batchMoney(b, supplierPayments);
          return (
            <li key={b.id} className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
              <button onClick={() => setOpen(isOpen ? null : b.id)} className="w-full p-5 text-left sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-[12.5px] text-white">{b.code}</span>
                      <h2 className="truncate font-display text-lg font-bold">{b.supplier}</h2>
                      {owed.status !== "paid" && <MoneyPill status={owed.status} overdueDays={owed.overdueDays} />}
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {b.supplierType} · bought {shortDate(b.date)} · {count(b.count)} machines for {rupees(b.totalCost)}
                    </p>
                    {/* where the batch's machines are now */}
                    <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                      {STAGE_ORDER.map((st) =>
                        s.counts[st] ? (
                          <div key={st} className={STAGE_STYLE[st].bar} style={{ flexGrow: s.counts[st] }} title={`${STAGES[st].label}: ${s.counts[st]}`} />
                        ) : null,
                      )}
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">
                      {count(s.sold)} sold · {count(b.count - s.sold - s.scrap)} still in stock · {count(s.scrap)} scrap
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-6 lg:w-[420px] lg:text-right">
                    <div>
                      <p className="text-[12.5px] text-ink-3">Money back</p>
                      <p className="font-display text-xl font-bold">{recovered}%</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mist">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${recovered}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[12.5px] text-ink-3">Profit so far</p>
                      <p className={cn("font-display text-xl font-bold", s.profitSoFar >= 0 ? "text-st-ready" : "text-ink-2")}>
                        {s.profitSoFar >= 0 ? rupeesShort(s.profitSoFar) : "Not yet"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12.5px] text-ink-3" title="If the rest sells at asking price">Expected profit</p>
                      <p className={cn("font-display text-xl font-bold", expected >= 0 ? "text-st-ready" : "text-st-scrap")}>{rupeesShort(expected)}</p>
                    </div>
                  </div>
                  <ChevronDown className={cn("hidden size-5 shrink-0 text-ink-3 transition lg:block", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="grid gap-px border-t border-line bg-line sm:grid-cols-4">
                  {[
                    ["Batch cost", `${rupees(b.totalCost)}${owed.balance > 0.5 ? ` · ${rupees(owed.balance)} still to pay` : " · paid"}`],
                    ["Repairs & upgrades", rupees(s.repair)],
                    ["Earned from sales", rupees(s.revenue)],
                    ["Unsold stock (asking price)", rupees(s.unsoldAsking)],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-mist/60 px-5 py-4">
                      <p className="text-[12.5px] text-ink-3">{k}</p>
                      <p className="mt-0.5 font-semibold">{v}</p>
                    </div>
                  ))}
                  <div className="bg-mist/60 px-5 py-4 sm:col-span-4">
                    <p className="text-sm text-ink-2">
                      Scrap rate: <b className={cn(s.scrap / b.count > 0.06 ? "text-st-scrap" : "text-ink")}>{Math.round((s.scrap / b.count) * 100)}%</b>
                      {s.scrap / b.count > 0.06 ? " — higher than usual. Inspect this seller's next lot before paying." : " — normal for this kind of lot."}
                      {b.note && <span className="ml-1 text-ink-3">Note: {b.note}</span>}
                    </p>
                    {can(role, "fixMistakes") && s.counts.checking === b.count && (
                      <Button variant="outline" size="sm" className="mt-3 text-st-scrap" onClick={() => remove(b.id, b.code)}>
                        <Trash2 /> Remove this batch (added by mistake)
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
