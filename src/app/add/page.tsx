"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Keyboard, Plus, Trash2, Upload } from "lucide-react";
import { useStore, type NewMachineInput } from "@/lib/data/store";
import { CATALOG } from "@/lib/data/seed";
import { downloadSampleSheet, parseSheet, type ParsedRow } from "@/lib/data/excel";
import type { Location, SupplierType } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { count, ordinal, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "excel" | "manual";

export default function AddStockPage() {
  const router = useRouter();
  const machines = useStore((s) => s.machines);
  const addBatch = useStore((s) => s.addBatch);
  const existing = useMemo(() => new Set(machines.map((m) => m.serial.toUpperCase())), [machines]);

  const [supplier, setSupplier] = useState("");
  const [supplierType, setSupplierType] = useState<SupplierType>("Corporate buyback");
  const [totalPaid, setTotalPaid] = useState<number | "">("");
  const [location, setLocation] = useState<Location>("Godown");
  const [mode, setMode] = useState<Mode>("excel");

  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [manual, setManual] = useState<NewMachineInput[]>([]);

  const good = mode === "excel" ? (parsed ?? []).filter((r) => r.data).map((r) => r.data!) : manual;
  const bad = mode === "excel" ? (parsed ?? []).filter((r) => r.error) : [];
  const sheetCost = good.reduce((s, m) => s + (m.cost || 0), 0);
  const total = totalPaid || sheetCost;
  const canSave = supplier.trim() && good.length > 0 && total > 0;

  const save = () => {
    const batch = addBatch({ supplier: supplier.trim(), supplierType, totalCost: total }, good, location);
    toast.success(`Batch ${batch.code} added — ${good.length} machines`, {
      description: "They are waiting in Check & grade.",
    });
    router.push("/check");
  };

  return (
    <div>
      <PageHeader title="Add stock" sub="Enter a new purchase batch. Every machine goes to Check & grade before it can be sold." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* Step 1 */}
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
            <StepTitle n={1} title="Where did this batch come from?" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Bought from">
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Hebbal office IT refresh" />
              </Field>
              <Field label="Type of seller">
                <Select value={supplierType} onChange={(e) => setSupplierType(e.target.value as SupplierType)}>
                  <option>Corporate buyback</option>
                  <option>Dealer</option>
                  <option>Import lot</option>
                  <option>Walk-in seller</option>
                </Select>
              </Field>
              <Field label="Total paid for the batch (₹)" hint={sheetCost && !totalPaid ? `Leave empty to use the sheet's total: ${rupees(sheetCost)}` : "Split across the machines to work out profit."}>
                <Input type="number" value={totalPaid} onChange={(e) => setTotalPaid(e.target.value === "" ? "" : +e.target.value)} placeholder="e.g. 1450000" />
              </Field>
              <Field label="Keep it at">
                <div className="grid grid-cols-2 gap-2">
                  {(["Godown", "Shop"] as Location[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLocation(l)}
                      className={cn(
                        "h-11 rounded-[11px] border text-[15px] font-semibold transition",
                        location === l ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2",
                      )}
                    >
                      {l === "Godown" ? "The godown" : "The shop"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Step 2 */}
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepTitle n={2} title="Add the machines" />
              <div className="inline-flex rounded-xl border border-line p-1">
                {(
                  [
                    ["excel", "Upload Excel", FileSpreadsheet],
                    ["manual", "Type them in", Keyboard],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    onClick={() => setMode(k)}
                    className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", mode === k ? "bg-ink text-white" : "text-ink-2")}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "excel" ? (
              <ExcelStep
                parsed={parsed}
                fileName={fileName}
                onFile={async (f) => {
                  setFileName(f.name);
                  try {
                    setParsed(await parseSheet(f, existing));
                  } catch {
                    toast.error("Couldn't read this file. Upload an .xlsx or .csv sheet.");
                  }
                }}
                onClear={() => {
                  setParsed(null);
                  setFileName("");
                }}
              />
            ) : (
              <ManualStep items={manual} setItems={setManual} existing={existing} />
            )}
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="rounded-[var(--radius-panel)] border-2 border-ink bg-surface p-5">
            <h2 className="font-display text-lg font-bold">This batch</h2>
            <dl className="mt-4 space-y-3 text-[15px]">
              <SumRow label="From" value={supplier || "—"} />
              <SumRow label="Machines" value={count(good.length)} big />
              {bad.length > 0 && <SumRow label="Rows with problems" value={`${bad.length} skipped`} warn />}
              <SumRow label="Total paid" value={total ? rupees(total) : "—"} />
              <SumRow label="Per machine" value={total && good.length ? rupees(total / good.length) : "—"} />
              <SumRow label="Goes to" value={location} />
            </dl>
            <Button size="lg" className="mt-5 w-full" disabled={!canSave} onClick={save}>
              <Plus /> Add {good.length ? count(good.length) : ""} machines to stock
            </Button>
            {!canSave && (
              <p className="mt-2 text-center text-[12.5px] text-ink-3">
                {!supplier.trim() ? "Enter who you bought from. " : ""}
                {!good.length ? "Add at least one machine. " : ""}
                {good.length && !total ? "Enter the total paid." : ""}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-lg font-bold">
      <span className="grid size-7 place-items-center rounded-full bg-ink font-sans text-[13px] text-white">{n}</span>
      {title}
    </h2>
  );
}

function SumRow({ label, value, big, warn }: { label: string; value: string; big?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("truncate text-right font-semibold", big && "font-display text-2xl", warn && "text-st-repair")}>{value}</dd>
    </div>
  );
}

function ExcelStep({
  parsed,
  fileName,
  onFile,
  onClear,
}: {
  parsed: ParsedRow[] | null;
  fileName: string;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  if (!parsed)
    return (
      <div className="mt-5">
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
            const f = e.dataTransfer.files[0];
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
          <span className="font-display text-lg font-bold">Drop the Excel sheet here, or tap to choose</span>
          <span className="max-w-md text-sm text-ink-2">
            One row per machine with serial, brand, model, processor, gen, RAM and storage. Column names can be in any order.
          </span>
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
        <button onClick={() => downloadSampleSheet(200)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
          <Download className="size-4" /> Download a sample sheet (200 machines)
        </button>
      </div>
    );

  const ok = parsed.filter((r) => r.data);
  const bad = parsed.filter((r) => r.error);
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mist p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-6 text-brand" />
          <div>
            <p className="font-semibold">{fileName}</p>
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-st-ready">{ok.length} machines ready to add</span>
              {bad.length > 0 && <span className="text-st-repair"> · {bad.length} rows need fixing</span>}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          Choose another file
        </Button>
      </div>

      {bad.length > 0 && (
        <div className="mt-3 rounded-2xl border border-st-repair/30 bg-st-repair-bg/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-st-repair">
            <AlertCircle className="size-4" /> These rows will be skipped
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {bad.slice(0, 6).map((r) => (
              <li key={r.row}>
                Row {r.row}: {r.error}
              </li>
            ))}
            {bad.length > 6 && <li>+ {bad.length - 6} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-[12.5px] text-ink-3">
              <th className="px-4 py-2.5 font-semibold">Row</th>
              <th className="px-3 font-semibold">Serial</th>
              <th className="px-3 font-semibold">Machine</th>
              <th className="px-3 font-semibold">Spec</th>
              <th className="px-4 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {ok.slice(0, 200).map((r) => (
              <tr key={r.row} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-2 text-ink-3">{r.row}</td>
                <td className="px-3 font-mono text-[13px]">{r.data!.serial}</td>
                <td className="px-3 font-medium">
                  {r.data!.brand} {r.data!.model}
                </td>
                <td className="px-3 text-ink-2">
                  {r.data!.cpu.replace("Core ", "")} {ordinal(r.data!.gen)} · {r.data!.ram}/{r.data!.storage} GB
                </td>
                <td className="px-4 text-right tabular-nums">{r.data!.cost ? rupees(r.data!.cost) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManualStep({
  items,
  setItems,
  existing,
}: {
  items: NewMachineInput[];
  setItems: (f: (x: NewMachineInput[]) => NewMachineInput[]) => void;
  existing: Set<string>;
}) {
  const [modelIdx, setModelIdx] = useState(0);
  const c = CATALOG[modelIdx];
  const [ram, setRam] = useState(c.rams[0]);
  const [storage, setStorage] = useState(c.storages[0]);
  const [serial, setSerial] = useState("");
  const [cost, setCost] = useState<number | "">("");
  const serialRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const s = serial.trim().toUpperCase();
    if (!s) return toast.error("Enter the serial number.");
    if (existing.has(s) || items.some((i) => i.serial === s)) return toast.error(`${s} is already added.`);
    setItems((x) => [
      ...x,
      {
        serial: s,
        type: c.type,
        brand: c.brand,
        model: c.model,
        cpu: c.cpu,
        gen: c.gen,
        ram,
        storage,
        storageType: storage === 500 ? "HDD" : "SSD",
        screen: c.screen,
        cost: cost || 0,
      },
    ]);
    setSerial("");
    serialRef.current?.focus();
  };

  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_.7fr_.8fr]">
        <Field label="Model" className="sm:col-span-2 lg:col-span-1">
          <Select
            value={modelIdx}
            onChange={(e) => {
              const i = +e.target.value;
              setModelIdx(i);
              setRam(CATALOG[i].rams[0]);
              setStorage(CATALOG[i].storages[0]);
            }}
          >
            {CATALOG.map((m, i) => (
              <option key={i} value={i}>
                {m.brand} {m.model} — {m.cpu.replace("Core ", "")} {ordinal(m.gen)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="RAM">
          <Select value={ram} onChange={(e) => setRam(+e.target.value)}>
            {[4, 8, 16, 32].map((v) => (
              <option key={v} value={v}>
                {v} GB
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Storage">
          <Select value={storage} onChange={(e) => setStorage(+e.target.value)}>
            {[128, 256, 500, 512, 1024].map((v) => (
              <option key={v} value={v}>
                {v} GB
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Serial number" className="sm:col-span-2 lg:col-span-1">
          <Input
            ref={serialRef}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Scan or type, then press Enter"
            className="font-mono"
          />
        </Field>
        <Field label="Cost ₹ (optional)">
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value === "" ? "" : +e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button className="h-11 w-full" onClick={add}>
            <Plus /> Add machine
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">Tip: keep the model, RAM and storage the same and just scan serial after serial.</p>

      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-line-soft rounded-2xl border border-line">
          {items.map((m, i) => (
            <li key={m.serial} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <CheckCircle2 className="size-4 text-st-ready" />
              <span className="font-mono">{m.serial}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {m.brand} {m.model} · {m.ram}/{m.storage} GB
              </span>
              <button onClick={() => setItems((x) => x.filter((_, j) => j !== i))} aria-label="Remove" className="text-ink-3 hover:text-st-scrap">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-mist px-4 py-6 text-center text-sm text-ink-2">Machines you add appear here.</p>
      )}
    </div>
  );
}
