"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, Truck } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { pickForRequirement, specLabel, specMatrix } from "@/lib/data/selectors";
import type { Grade, MachineType, Requirement } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RequirementFields } from "@/components/requirement-fields";
import { count, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRADES: Grade[] = ["A", "B", "C"];

export default function StockPage() {
  const machines = useStore((s) => s.machines);
  const [type, setType] = useState<MachineType>("Laptop");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => specMatrix(machines).filter((r) => r.type === type), [machines, type]);
  const max = Math.max(1, ...rows.flatMap((r) => [r.A, r.B, r.C]));
  const totals = rows.reduce(
    (t, r) => ({ A: t.A + r.A, B: t.B + r.B, C: t.C + r.C, all: t.all + r.total }),
    { A: 0, B: 0, C: 0, all: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Ready stock"
        sub="Everything checked and ready to sell, grouped the way buyers ask for it: processor, RAM and storage."
      />

      <CanIFill />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1">
          {(["Laptop", "Desktop"] as MachineType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                type === t ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
              )}
            >
              {t}s
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">
          <b className="text-ink">{count(totals.all)}</b> {type.toLowerCase()}s ready across {rows.length} specs
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line text-[12.5px] font-semibold text-ink-3">
              <th className="py-3 pl-5 pr-3 font-semibold">Spec</th>
              {GRADES.map((g) => (
                <th key={g} className="w-[16%] px-2 text-center font-semibold">
                  Grade {g}
                </th>
              ))}
              <th className="px-3 text-right font-semibold">Total</th>
              <th className="py-3 pl-3 pr-5 text-right font-semibold">Avg. asking price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <tr
                  onClick={() => setOpen(open === r.key ? null : r.key)}
                  className="cursor-pointer border-b border-line-soft transition hover:bg-mist/60"
                >
                  <td className="py-3 pl-5 pr-3">
                    <span className="flex items-center gap-2">
                      <ChevronDown className={cn("size-4 text-ink-3 transition", open === r.key && "rotate-180")} />
                      <span className="text-[15px] font-semibold">{specLabel(r)}</span>
                    </span>
                  </td>
                  {GRADES.map((g) => (
                    <td key={g} className="px-2 py-2">
                      <HeatCell n={r[g]} max={max} />
                    </td>
                  ))}
                  <td className="px-3 text-right font-display text-[19px] font-bold">{r.total}</td>
                  <td className="py-3 pl-3 pr-5 text-right text-sm tabular-nums text-ink-2">{rupees(r.avgPrice)}</td>
                </tr>
                {open === r.key && (
                  <tr className="border-b border-line-soft bg-mist/50">
                    <td colSpan={6} className="px-5 py-3 pl-11 text-sm text-ink-2">
                      Models in this spec: <b className="text-ink">{r.models.join(", ")}</b>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            <tr className="bg-mist/60 text-sm font-semibold">
              <td className="py-3 pl-5">All {type.toLowerCase()}s</td>
              {GRADES.map((g) => (
                <td key={g} className="text-center tabular-nums">
                  {totals[g]}
                </td>
              ))}
              <td className="px-3 text-right tabular-nums">{totals.all}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">
        Grade A: like new. Grade B: light marks, works perfectly. Grade C: visible wear, works perfectly. Darker boxes mean more stock.
      </p>
    </div>
  );
}

function HeatCell({ n, max }: { n: number; max: number }) {
  if (!n) return <div className="grid h-11 place-items-center rounded-lg text-sm text-ink-3/60">—</div>;
  const t = Math.max(0.12, n / max);
  const dark = t > 0.5;
  return (
    <div
      className={cn("grid h-11 place-items-center rounded-lg font-display text-[17px] font-bold tabular-nums", dark ? "text-white" : "text-brand-deep")}
      style={{ background: `color-mix(in oklab, var(--color-brand) ${Math.round(t * 100)}%, var(--color-brand-soft))` }}
    >
      {n}
    </div>
  );
}

/** "A buyer wants 120 × i5 8th gen 8/256 Grade A — do we have it?" */
function CanIFill() {
  const machines = useStore((s) => s.machines);
  const [need, setNeed] = useState<Requirement>({
    type: "Laptop",
    cpu: "Core i5",
    minGen: 8,
    ram: 8,
    storage: 256,
    grade: "A",
    qty: 120,
  });
  const result = useMemo(() => pickForRequirement(machines, need), [machines, need]);
  const enough = result.shortBy === 0;
  const params = new URLSearchParams(Object.entries(need).map(([k, v]) => [k, String(v)])).toString();

  return (
    <section className="rounded-[var(--radius-panel)] border-2 border-ink bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">A buyer is asking — can you fill it?</h2>
      <p className="mt-1 text-sm text-ink-2">Pick what they want. Machines with a better spec or grade also count.</p>
      <RequirementFields need={need} onChange={setNeed} className="mt-5 lg:grid-cols-7" />

      <div
        className={cn(
          "mt-5 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between",
          enough ? "bg-st-ready-bg" : "bg-st-checking-bg",
        )}
      >
        <div className="flex items-start gap-3">
          {enough ? (
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-st-ready" />
          ) : (
            <CircleAlert className="mt-0.5 size-6 shrink-0 text-st-checking" />
          )}
          <div>
            <p className={cn("font-display text-[19px] font-bold", enough ? "text-st-ready" : "text-st-checking")}>
              {enough
                ? `Yes — you have ${count(result.available)} that fit`
                : `Only ${count(result.available)} fit — short by ${count(result.shortBy)}`}
            </p>
            <p className="text-sm text-ink-2">
              {enough
                ? "The oldest stock and the closest spec are picked first, so better machines stay for better deals."
                : "Try a lower grade or a lower spec, or check the machines still waiting to be graded."}
            </p>
          </div>
        </div>
        {result.available > 0 && (
          <Button asChild size="lg" className="shrink-0">
            <Link href={`/orders?${params}`}>
              <Truck /> Book {count(Math.min(need.qty, result.available))} for a buyer
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
