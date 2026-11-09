"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AlertCircle, CheckCircle2, Download, Eraser, FileSpreadsheet, Upload } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { downloadImportTemplate, parseStockSheet, STOCK_FIELD_LABEL, type StockParse } from "@/lib/data/excel";
import { askingPrice } from "@/lib/data/seed";
import { STAGES } from "@/lib/data/types";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { STAGE_STYLE } from "@/components/stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { count, ordinal, rupees, rupeesShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHUNK = 1500; // rows per save, to stay well inside the request size limit

export default function ImportPage() {
  const user = useStore((s) => s.user);
  const dataMode = useStore((s) => s.dataMode);
  const machines = useStore((s) => s.machines);
  const existing = useMemo(() => new Set(machines.map((m) => m.serial.toUpperCase())), [machines]);
  const importStock = useStore((s) => s.importStock);

  const [parsed, setParsed] = useState<StockParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ imported: number; batches: string[] } | null>(null);

  const good = useMemo(() => (parsed?.rows ?? []).filter((r) => r.data).map((r) => r.data!), [parsed]);
  const bad = (parsed?.rows ?? []).filter((r) => r.error);
  const skipped = (parsed?.rows ?? []).filter((r) => r.skipped);
  const byStage = useMemo(() => {
    const m = { ready: 0, checking: 0, repair: 0, scrap: 0 };
    good.forEach((g) => m[g.stage]++);
    return m;
  }, [good]);
  const costTotal = good.reduce((s, g) => s + g.cost, 0);
  const askTotal = good
    .filter((g) => g.stage === "ready")
    .reduce((s, g) => s + (g.price ?? askingPrice({ cost: g.cost, repairCost: 0, grade: g.grade ?? "B", ram: g.ram, storage: g.storage })), 0);
  const missingCost = good.filter((g) => !g.cost).length;

  const runImport = async () => {
    // keep each supplier's machines together so a supplier's stock lands in one batch where possible
    const sorted = [...good].sort((a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? ""));
    let imported = 0;
    const batches: string[] = [];
    setProgress(0);
    for (let i = 0; i < sorted.length; i += CHUNK) {
      const res = await importStock({ rows: sorted.slice(i, i + CHUNK), alreadyPaid });
      if (!res.ok) {
        setProgress(null);
        toast.error(imported ? `${count(imported)} machines were imported, then this stopped: ${res.error}` : res.error);
        if (imported) setDone({ imported, batches });
        return;
      }
      imported += res.imported;
      batches.push(...res.batchCodes);
      setProgress(Math.round((imported / sorted.length) * 100));
    }
    setProgress(null);
    setDone({ imported, batches });
    setParsed(null);
    toast.success(`${count(imported)} machines imported`);
  };

  const errorSheet = () => {
    const ws = XLSX.utils.json_to_sheet(bad.map((r) => ({ Row: r.row, Problem: r.error, ...r.raw })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fix these");
    XLSX.writeFile(wb, "rows-to-fix.xlsx");
  };

  return (
    <div>
      <PageHeader
        title="Bring in your existing stock"
        sub="Upload the Excel sheet you keep today. Every machine comes in with its status, grade, location and prices — no retyping."
      />

      {dataMode === "sample" && <StartFresh owner={can(user?.role, "reset")} />}

      {done && (
        <section className="mb-5 rounded-[var(--radius-panel)] border-2 border-st-ready/40 bg-surface p-6">
          <CheckCircle2 className="size-8 text-st-ready" />
          <h2 className="font-display mt-2 text-2xl font-bold">{count(done.imported)} machines are in</h2>
          <p className="mt-1 text-ink-2">
            Added as batch{done.batches.length === 1 ? "" : "es"} {done.batches.join(", ")}. They show everywhere now — Home, All machines, Ready stock and Check &amp; grade.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild><Link href="/">Go to Home</Link></Button>
            <Button asChild variant="outline"><Link href="/machines">See all machines</Link></Button>
            <Button variant="outline" onClick={() => setDone(null)}>Import another sheet</Button>
          </div>
        </section>
      )}

      {!parsed && !done && (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <Drop
            onFile={async (f) => {
              setFileName(f.name);
              try {
                setParsed(await parseStockSheet(f, existing));
              } catch {
                toast.error("Couldn't read this file. Upload an .xlsx, .xls or .csv sheet.");
              }
            }}
          />
          <div className="mt-5 grid gap-4 border-t border-line-soft pt-5 text-[14px] text-ink-2 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-ink">Your own sheet works</p>
              <p className="mt-1">
                Columns can be in any order and named the way you already name them — “Service tag”, “Make”, “i5-8350U”, “8 GB DDR4”, “1 TB”, “Faulty”, “Godown”. We show you what we read before anything is saved.
              </p>
            </div>
            <div>
              <p className="font-semibold text-ink">Needed for each machine</p>
              <p className="mt-1">Serial, brand, model, processor, RAM and storage. Status, grade, location, prices, supplier and date are used when present.</p>
              <button onClick={downloadImportTemplate} className="mt-2 inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                <Download className="size-4" /> Download a template
              </button>
            </div>
          </div>
        </section>
      )}

      {parsed && (
        <div className="space-y-5">
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-6 text-brand" />
                <div>
                  <p className="font-semibold">{fileName}</p>
                  <p className="text-sm text-ink-2">Read from the “{parsed.sheetName}” tab</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setParsed(null)}>Choose another file</Button>
            </div>

            <p className="mt-5 text-sm font-semibold">Columns we read</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(STOCK_FIELD_LABEL) as (keyof typeof STOCK_FIELD_LABEL)[]).map((k) => {
                const from = parsed.columns[k];
                return (
                  <span
                    key={k}
                    className={cn("rounded-full px-2.5 py-1 text-[12.5px]", from ? "bg-brand-soft text-brand-deep" : "bg-mist text-ink-3")}
                    title={from ? `From your column “${from}”` : "Not in this sheet"}
                  >
                    {STOCK_FIELD_LABEL[k]}
                    {from && from.toLowerCase() !== STOCK_FIELD_LABEL[k].toLowerCase() ? <span className="opacity-60"> ← {from}</span> : null}
                    {!from && " — not found"}
                  </span>
                );
              })}
            </div>
            {parsed.ignored.length > 0 && (
              <p className="mt-2 text-[13px] text-ink-3">Not used: {parsed.ignored.join(", ")}</p>
            )}
          </section>

          <section className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface sm:grid-cols-3">
            <Tile label="Machines to bring in" value={count(good.length)}>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["ready", "checking", "repair", "scrap"] as const).map((st) =>
                  byStage[st] ? (
                    <span key={st} className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", `${STAGE_STYLE[st].bg} ${STAGE_STYLE[st].text}`)}>
                      {count(byStage[st])} {STAGES[st].label.toLowerCase()}
                    </span>
                  ) : null,
                )}
              </div>
            </Tile>
            <Tile label="Bought for" value={rupeesShort(costTotal)} note={missingCost ? `${count(missingCost)} without a buying price — profit on those will look higher` : "Buying price found for every machine"} warn={missingCost > 0} />
            <Tile label="Ready stock at asking price" value={rupeesShort(askTotal)} note="Your selling price, or worked out from cost and grade" />
          </section>

          {(bad.length > 0 || skipped.length > 0) && (
            <section className="rounded-[var(--radius-panel)] border border-st-repair/30 bg-st-repair-bg/50 p-5">
              {bad.length > 0 && (
                <>
                  <p className="flex items-center gap-2 font-bold text-st-repair">
                    <AlertCircle className="size-4" /> {bad.length === 1 ? "1 row" : `${count(bad.length)} rows`} can&apos;t come in yet
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ink-2">
                    {bad.slice(0, 8).map((r) => (
                      <li key={r.row}>Row {r.row}: {r.error}</li>
                    ))}
                    {bad.length > 8 && <li>+ {count(bad.length - 8)} more</li>}
                  </ul>
                  <button onClick={errorSheet} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
                    <Download className="size-4" /> Download these rows to fix and upload again
                  </button>
                </>
              )}
              {skipped.length > 0 && (
                <p className={cn("text-sm text-ink-2", bad.length > 0 && "mt-3")}>
                  {skipped.length === 1 ? "1 row is" : `${count(skipped.length)} rows are`} marked sold, so {skipped.length === 1 ? "it is" : "they are"} left out of stock.
                </p>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-[12.5px] text-ink-3">
                    <th className="px-4 py-2.5 font-semibold">Serial</th>
                    <th className="px-3 font-semibold">Machine</th>
                    <th className="px-3 font-semibold">Spec</th>
                    <th className="px-3 font-semibold">Status</th>
                    <th className="px-3 font-semibold">At</th>
                    <th className="px-3 text-right font-semibold">Bought</th>
                    <th className="px-4 text-right font-semibold">Selling</th>
                  </tr>
                </thead>
                <tbody>
                  {good.slice(0, 150).map((g) => (
                    <tr key={g.serial} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-2 font-mono text-[13px]">{g.serial}</td>
                      <td className="px-3 font-medium">
                        {g.brand} {g.model}
                        {g.type === "Desktop" && <span className="ml-1 text-ink-3">(desktop)</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 text-ink-2">
                        {g.cpu.replace("Core ", "")} {ordinal(g.gen)} · {g.ram}/{g.storage} GB {g.storageType}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", `${STAGE_STYLE[g.stage].bg} ${STAGE_STYLE[g.stage].text}`)}>{STAGES[g.stage].label}</span>
                        {g.grade && <span className="ml-1.5 font-semibold">{g.grade}</span>}
                      </td>
                      <td className="px-3 text-ink-2">{g.location}</td>
                      <td className="px-3 text-right tabular-nums">{g.cost ? rupees(g.cost) : "—"}</td>
                      <td className="px-4 text-right tabular-nums">{g.price ? rupees(g.price) : g.stage === "ready" ? <span className="text-ink-3">auto</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {good.length > 150 && <p className="border-t border-line px-4 py-2 text-[13px] text-ink-3">Showing 150 of {count(good.length)}</p>}
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <label className="flex items-start gap-3 text-[14.5px]">
              <input type="checkbox" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="mt-1 size-4 accent-[var(--color-brand)]" />
              <span>
                <b>Suppliers are already paid for this stock</b>
                <span className="block text-ink-2">Untick if you still owe money on it — it will then show under Suppliers to pay.</span>
              </span>
            </label>
            <Button size="lg" disabled={!good.length || progress !== null} onClick={runImport} className="shrink-0">
              <Upload /> {progress !== null ? `Importing… ${progress}%` : `Bring in ${count(good.length)} machines`}
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}

function StartFresh({ owner }: { owner: boolean }) {
  const startLive = useStore((s) => s.startLive);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!owner)
    return (
      <p className="mb-5 rounded-2xl bg-st-repair-bg/60 px-4 py-3 text-[14px] text-ink-2">
        The app still has sample data in it. Ask the owner to clear it from this page before you bring in real stock, so the two don&apos;t mix.
      </p>
    );
  return (
    <section className="mb-5 rounded-[var(--radius-panel)] border-2 border-dashed border-st-repair/50 bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-xl font-bold">Step 1: clear the sample data</h2>
          <p className="mt-1 text-ink-2">
            Right now the app is full of sample machines, orders and bills. Clear them so only your real stock is counted. Staff, PINs and your business settings stay. Bill numbers start again from 0001.
          </p>
        </div>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0">
            <Eraser /> Clear sample data
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type START to confirm" className="sm:max-w-xs" autoFocus />
          <Button
            disabled={busy || text.trim().toUpperCase() !== "START"}
            onClick={async () => {
              setBusy(true);
              const res = await startLive(text);
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Sample data cleared. The app is ready for your real stock.");
            }}
          >
            {busy ? "Clearing…" : "Clear it — this can't be undone"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      )}
    </section>
  );
}

function Drop({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <>
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
          drag ? "border-brand bg-brand-soft" : "border-line hover:border-ink-3 hover:bg-mist/60",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Upload className="size-6" />
        </span>
        <span className="font-display text-lg font-bold">Drop your stock sheet here, or tap to choose</span>
        <span className="text-sm text-ink-2">.xlsx, .xls or .csv — nothing is saved until you confirm</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function Tile({ label, value, note, warn, children }: { label: string; value: string; note?: string; warn?: boolean; children?: React.ReactNode }) {
  return (
    <div className="border-b border-line-soft p-5 last:border-0 sm:border-b-0 sm:border-r sm:p-6 sm:last:border-r-0">
      <p className="text-[13.5px] font-semibold text-ink-2">{label}</p>
      <p className="font-display mt-2 text-[30px] font-bold leading-none">{value}</p>
      {note && <p className={cn("mt-2 text-[13px]", warn ? "text-st-repair" : "text-ink-3")}>{note}</p>}
      {children}
    </div>
  );
}
