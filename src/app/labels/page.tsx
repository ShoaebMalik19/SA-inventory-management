"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { useUI } from "@/lib/ui-store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { Barcode } from "@/components/barcode";
import { count, ordinal } from "@/lib/format";

export default function LabelsPage() {
  const machines = useStore((s) => s.machines);
  const batches = useStore((s) => s.batches);
  const labelIds = useUI((s) => s.labelIds);
  const setLabelIds = useUI((s) => s.setLabelIds);
  const [batchId, setBatchId] = useState("");

  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const items = labelIds.map((id) => byId.get(id)).filter((m) => !!m);
  const recentBatches = [...batches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Print labels"
        sub="Stick one on each machine. The barcode is the serial number, so any scanner or phone camera can find it in the system."
        actions={
          items.length > 0 && (
            <Button size="lg" onClick={() => window.print()}>
              <Printer /> Print {count(items.length)} label{items.length > 1 ? "s" : ""}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <p className="text-sm font-semibold sm:mr-auto">
          {items.length ? `${count(items.length)} labels ready` : "Pick machines to label"}
        </p>
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:w-80" aria-label="Batch">
          <option value="">Labels for a whole batch…</option>
          {recentBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} — {b.supplier} ({b.count})
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          disabled={!batchId}
          onClick={() => setLabelIds(machines.filter((m) => m.batchId === batchId && m.stage !== "sold" && m.stage !== "scrap").map((m) => m.id))}
        >
          Use this batch
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">No labels yet</p>
          <p className="mt-1 text-ink-2">
            Choose a batch above, or tick machines on{" "}
            <Link href="/machines" className="font-semibold text-brand underline">
              All machines
            </Link>{" "}
            and press “Print labels”.
          </p>
        </div>
      ) : (
        <div className="print-labels mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => (
            <div key={m.id} className="label flex flex-col rounded-xl border-2 border-ink bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wide text-ink-3">S.A COMPUTERS · RT NAGAR</p>
                  <p className="truncate font-display text-[16px] font-bold leading-tight">
                    {m.brand} {m.model}
                  </p>
                  <p className="text-[12px] text-ink-2">
                    {m.cpu.replace("Core ", "")} {ordinal(m.gen)} gen · {m.ram} GB · {m.storage} GB {m.storageType}
                  </p>
                </div>
                {m.grade && (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-ink font-display text-lg font-bold">{m.grade}</span>
                )}
              </div>
              <Barcode value={m.serial} height={36} className="mt-2 h-9 w-full" />
              <p className="mt-1 text-center font-mono text-[13px] font-medium tracking-[0.12em]">{m.serial}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
