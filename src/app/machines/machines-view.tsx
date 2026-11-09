"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import * as XLSX from "xlsx";
import { useStore } from "@/lib/data/store";
import { useUI } from "@/lib/ui-store";
import { isOlderThan } from "@/lib/data/selectors";
import { STAGE_ORDER, STAGES, type Stage } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { GradeBadge, STAGE_STYLE, StagePill } from "@/components/stage";
import { Input, Select } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { count, daysSince, ordinal, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 40;

export function MachinesView({ initialStage, initialOld }: { initialStage?: Stage; initialOld?: boolean }) {
  const machines = useStore((s) => s.machines);
  const batches = useStore((s) => s.batches);
  const openMachine = useUI((s) => s.openMachine);

  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [stage, setStage] = useState<Stage | "stock" | "all">(initialStage ?? "stock");
  const [type, setType] = useState("all");
  const [brand, setBrand] = useState("all");
  const [location, setLocation] = useState("all");
  const [grade, setGrade] = useState("all");
  const [oldOnly, setOldOnly] = useState(!!initialOld);
  const [shown, setShown] = useState(PAGE);

  const brands = useMemo(() => [...new Set(machines.map((m) => m.brand))].sort(), [machines]);
  const batchCode = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, b.code])), [batches]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
    machines.forEach((m) => c[m.stage]++);
    return c;
  }, [machines]);
  const inStockCount = counts.checking + counts.repair + counts.ready + counts.booked;

  const filtered = useMemo(() => {
    return machines
      .filter((m) => {
        if (stage === "stock" && (m.stage === "sold" || m.stage === "scrap")) return false;
        if (stage !== "stock" && stage !== "all" && m.stage !== stage) return false;
        if (type !== "all" && m.type !== type) return false;
        if (brand !== "all" && m.brand !== brand) return false;
        if (location !== "all" && m.location !== location) return false;
        if (grade !== "all" && m.grade !== grade) return false;
        if (oldOnly && !isOlderThan(m, 60)) return false;
        if (query) {
          const hay = `${m.serial} ${m.brand} ${m.model} ${m.cpu} ${m.gen}th ${m.ram}gb ${m.storage}gb ${batchCode[m.batchId]}`.toLowerCase();
          if (!query.split(/\s+/).every((w) => hay.includes(w))) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [machines, stage, type, brand, location, grade, oldOnly, query, batchCode]);

  // exact serial typed or scanned → open it straight away
  const exact = query.length >= 6 ? filtered.find((m) => m.serial.toLowerCase() === query) : undefined;

  const reset = () => {
    setQ("");
    setStage("stock");
    setType("all");
    setBrand("all");
    setLocation("all");
    setGrade("all");
    setOldOnly(false);
  };
  const anyFilter = q || stage !== "stock" || type !== "all" || brand !== "all" || location !== "all" || grade !== "all" || oldOnly;

  const exportExcel = () => {
    const rows = filtered.map((m) => ({
      Serial: m.serial,
      Type: m.type,
      Brand: m.brand,
      Model: m.model,
      Processor: `${m.cpu} ${ordinal(m.gen)} gen`,
      "RAM (GB)": m.ram,
      "Storage (GB)": m.storage,
      Grade: m.grade ?? "",
      Status: STAGES[m.stage].label,
      Location: m.location,
      Batch: batchCode[m.batchId],
      "Asking price": m.price || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Machines");
    XLSX.writeFile(wb, `SA-Computers-machines-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const chips: { key: Stage | "stock" | "all"; label: string; n: number }[] = [
    { key: "stock", label: "In stock", n: inStockCount },
    ...STAGE_ORDER.map((s) => ({ key: s, label: STAGES[s].label, n: counts[s] })),
    { key: "all", label: "Everything", n: machines.length },
  ];

  return (
    <div>
      <PageHeader
        title="All machines"
        sub="Every laptop and desktop, one row each. Type a serial number, model or spec, or scan a barcode."
        actions={
          <Button variant="outline" onClick={exportExcel}>
            <Download /> Download Excel
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && exact) openMachine(exact.id);
          }}
          placeholder="Search: serial number, “T480”, “i5 8th 16gb”…"
          className="h-14 rounded-2xl pl-12 text-[16px]"
        />
        {exact && (
          <button
            onClick={() => openMachine(exact.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-tag px-3 py-2 text-sm font-semibold text-ink"
          >
            Open {exact.serial}
          </button>
        )}
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => {
          const active = stage === c.key;
          return (
            <button
              key={c.key}
              onClick={() => {
                setStage(c.key);
                setShown(PAGE);
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition",
                active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
              )}
            >
              {c.key !== "stock" && c.key !== "all" && <span className={cn("size-2 rounded-full", STAGE_STYLE[c.key].dot)} />}
              {c.label}
              <span className={cn("tabular-nums", active ? "text-white/70" : "text-ink-3")}>{count(c.n)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,170px))_1fr]">
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="all">All types</option>
          <option value="Laptop">Laptops</option>
          <option value="Desktop">Desktops</option>
        </Select>
        <Select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        <Select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="all">Shop & godown</option>
          <option value="Shop">At the shop</option>
          <option value="Godown">In the godown</option>
        </Select>
        <Select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
          <option value="all">Any grade</option>
          <option value="A">Grade A</option>
          <option value="B">Grade B</option>
          <option value="C">Grade C</option>
        </Select>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-4 lg:col-span-1 lg:justify-end">
          {oldOnly && (
            <span className="flex items-center gap-1.5 rounded-full bg-st-scrap-bg px-3 py-1.5 text-[13px] font-semibold text-st-scrap">
              Older than 60 days
              <button onClick={() => setOldOnly(false)} aria-label="Remove filter">
                <X className="size-3.5" />
              </button>
            </span>
          )}
          {anyFilter && (
            <button onClick={reset} className="text-sm font-semibold text-brand hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="mt-5 text-sm text-ink-2">
        Showing <b className="text-ink">{count(Math.min(shown, filtered.length))}</b> of {count(filtered.length)} machines
      </p>

      {filtered.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="font-display text-xl font-bold">No machines match</p>
          <p className="mt-1 text-ink-2">Check the serial number, or clear the filters to see everything.</p>
          <Button variant="outline" className="mt-5" onClick={reset}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
          {/* desktop table */}
          <table className="hidden w-full text-left md:table">
            <thead>
              <tr className="border-b border-line text-[12.5px] font-semibold text-ink-3">
                <th className="py-3 pl-5 pr-3 font-semibold">Machine</th>
                <th className="px-3 font-semibold">Serial</th>
                <th className="px-3 font-semibold">Grade</th>
                <th className="px-3 font-semibold">Status</th>
                <th className="px-3 font-semibold">Where</th>
                <th className="px-3 text-right font-semibold">Days in stock</th>
                <th className="py-3 pl-3 pr-5 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((m) => (
                <tr
                  key={m.id}
                  tabIndex={0}
                  onClick={() => openMachine(m.id)}
                  onKeyDown={(e) => e.key === "Enter" && openMachine(m.id)}
                  className="cursor-pointer border-b border-line-soft transition last:border-0 hover:bg-mist/70 focus-visible:bg-mist"
                >
                  <td className="py-3 pl-5 pr-3">
                    <p className="text-[15px] font-semibold">
                      {m.brand} {m.model}
                    </p>
                    <p className="text-[13px] text-ink-3">
                      {m.cpu} {ordinal(m.gen)} gen · {m.ram} GB · {m.storage} GB {m.storageType}
                    </p>
                  </td>
                  <td className="px-3 font-mono text-[13px] text-ink-2">{m.serial}</td>
                  <td className="px-3">
                    <GradeBadge grade={m.grade} />
                  </td>
                  <td className="px-3">
                    <StagePill stage={m.stage} />
                  </td>
                  <td className="px-3 text-sm text-ink-2">{m.location}</td>
                  <td className="px-3 text-right text-sm tabular-nums text-ink-2">
                    {m.stage === "sold" ? "—" : daysSince(m.addedAt)}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right text-[15px] font-semibold tabular-nums">
                    {m.stage === "sold" && m.soldPrice ? (
                      <span className="text-ink-3">{rupees(m.soldPrice)}</span>
                    ) : m.price ? (
                      rupees(m.price)
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* phone list */}
          <ul className="divide-y divide-line-soft md:hidden">
            {filtered.slice(0, shown).map((m) => (
              <li key={m.id}>
                <button onClick={() => openMachine(m.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  <GradeBadge grade={m.grade} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {m.brand} {m.model}
                    </span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {m.cpu.replace("Core ", "")} {ordinal(m.gen)} · {m.ram}/{m.storage} GB · <span className="font-mono">{m.serial}</span>
                    </span>
                    <StagePill stage={m.stage} className="mt-1.5" />
                  </span>
                  <span className="shrink-0 text-right text-[14px] font-semibold">{m.price ? rupees(m.price) : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown < filtered.length && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setShown((s) => s + PAGE * 2)}>
            Show more machines
          </Button>
        </div>
      )}
    </div>
  );
}
