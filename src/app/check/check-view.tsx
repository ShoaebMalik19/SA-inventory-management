"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCheck, ScanLine, ShieldCheck, Trash2, Wrench, X } from "lucide-react";
import { useStore } from "@/lib/data/store";
import type { Grade, Machine } from "@/lib/data/types";
import { FAIL_CHECKS } from "@/lib/data/seed";
import { PageHeader } from "@/components/page-header";
import { ScanButton } from "@/components/scan-button";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { GRADE_MEANING, StagePill } from "@/components/stage";
import { count, ordinal, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "checking" | "repair";

export function CheckView({ initialId }: { initialId?: string }) {
  const machines = useStore((s) => s.machines);
  const initial = initialId ? machines.find((m) => m.id === initialId) : undefined;
  const [tab, setTab] = useState<Tab>(initial?.stage === "repair" ? "repair" : "checking");
  const [activeId, setActiveId] = useState<string | null>(initial && (initial.stage === "checking" || initial.stage === "repair") ? initial.id : null);
  const [scan, setScan] = useState("");

  const queue = useMemo(
    () => machines.filter((m) => m.stage === tab).sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    [machines, tab],
  );
  const waiting = machines.filter((m) => m.stage === "checking").length;
  const inRepair = machines.filter((m) => m.stage === "repair").length;
  const active = activeId ? machines.find((m) => m.id === activeId) : undefined;

  const openNext = (doneId: string) => {
    const next = queue.find((m) => m.id !== doneId);
    setActiveId(next ? next.id : null);
  };

  const findBySerial = (value?: string) => {
    const s = (value ?? scan).trim().toLowerCase();
    const m = machines.find((x) => x.serial.toLowerCase() === s);
    if (!m) return toast.error("No machine with this serial number. Check the number and try again.");
    if (m.stage !== "checking" && m.stage !== "repair") return toast.info(`This machine is already checked. Status: ${m.stage === "ready" ? "Ready to sell" : m.stage}.`);
    setTab(m.stage);
    setActiveId(m.id);
    setScan("");
  };

  return (
    <div>
      <PageHeader
        title="Check & grade"
        sub="Test each machine, give it a grade, and it moves to ready stock. Oldest arrivals are at the top."
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <Input
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && findBySerial()}
            placeholder="Scan or type the serial number on the machine"
            className="h-14 rounded-2xl pl-12 text-[16px]"
          />
        </div>
        <Button size="lg" className="h-14 rounded-2xl" onClick={() => findBySerial()} disabled={!scan.trim()}>
          Open machine
        </Button>
        <ScanButton className="h-14 justify-center rounded-2xl" label="Scan with camera" onScan={(t) => findBySerial(t)} />
      </div>

      <div className="mt-5 inline-flex rounded-xl border border-line bg-surface p-1">
        {(
          [
            ["checking", `Waiting for check (${count(waiting)})`],
            ["repair", `In repair (${count(inRepair)})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition", tab === t ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {queue.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-bold">{tab === "checking" ? "Everything is checked" : "Nothing in repair"}</p>
          <p className="mt-1 text-ink-2">
            {tab === "checking" ? "New machines appear here when you add a batch." : "Machines that fail a check appear here."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {queue.slice(0, 60).map((m) => (
            <li key={m.id}>
              <button
                onClick={() => setActiveId(m.id)}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand"
              >
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tab === "checking" ? "bg-st-checking-bg text-st-checking" : "bg-st-repair-bg text-st-repair")}>
                  {tab === "checking" ? <ClipboardCheck className="size-5" /> : <Wrench className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {m.brand} {m.model}
                  </span>
                  <span className="block truncate text-[13px] text-ink-3">
                    <span className="font-mono">{m.serial}</span> · {m.ram}/{m.storage} GB
                  </span>
                  <span className="block text-[12.5px] text-ink-3">
                    {tab === "repair" && m.failedChecks ? `Failed: ${m.failedChecks.join(", ")}` : `Arrived ${timeAgo(m.addedAt)}`}
                  </span>
                </span>
                <span className="rounded-lg bg-mist px-2.5 py-1.5 text-[13px] font-semibold text-brand transition group-hover:bg-brand group-hover:text-white">
                  {tab === "checking" ? "Check" : "Fix"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {queue.length > 60 && <p className="mt-3 text-center text-sm text-ink-3">+ {count(queue.length - 60)} more in the queue</p>}

      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)} title="Check machine">
        {active &&
          (active.stage === "repair" ? (
            <RepairForm key={active.id} m={active} onDone={() => openNext(active.id)} />
          ) : (
            <CheckForm key={active.id} m={active} remaining={queue.length - 1} onDone={() => openNext(active.id)} />
          ))}
      </Sheet>
    </div>
  );
}

function MachineHead({ m, label }: { m: Machine; label: string }) {
  return (
    <div className="border-b border-line-soft px-5 pb-5 pt-6">
      <p className="text-[13.5px] font-semibold text-ink-3">{label}</p>
      <h2 className="font-display mt-2 text-[24px] font-bold leading-tight">
        {m.brand} {m.model}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        <span className="font-mono text-ink">{m.serial}</span> · {m.cpu} {ordinal(m.gen)} gen · {m.ram} GB · {m.storage} GB {m.storageType}
      </p>
      <StagePill stage={m.stage} className="mt-3" />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line-soft px-5 py-5">
      <h3 className="flex items-center gap-2.5 text-[15.5px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white">{n}</span>
        {title}
      </h3>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function GradePicker({ grade, setGrade }: { grade: Grade | null; setGrade: (g: Grade) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(["A", "B", "C"] as Grade[]).map((g) => (
        <button
          key={g}
          onClick={() => setGrade(g)}
          className={cn(
            "rounded-2xl border-2 p-3 text-left transition",
            grade === g ? "border-brand bg-brand-soft" : "border-line hover:border-ink-3",
          )}
        >
          <span className={cn("font-display text-[28px] font-bold leading-none", grade === g ? "text-brand" : "text-ink")}>{g}</span>
          <span className="mt-1.5 block text-[12.5px] leading-snug text-ink-2">{GRADE_MEANING[g]}</span>
        </button>
      ))}
    </div>
  );
}

function CheckForm({ m, remaining, onDone }: { m: Machine; remaining: number; onDone: () => void }) {
  const checkMachine = useStore((s) => s.checkMachine);
  const tests = m.type === "Desktop" ? ["Boots up", "Ports", "Wi-Fi", "Power supply"] : FAIL_CHECKS;
  const [failed, setFailed] = useState<string[]>([]);
  const [battery, setBattery] = useState<number | "">(m.type === "Laptop" ? "" : "");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [wiped, setWiped] = useState(false);
  const [ram, setRam] = useState(m.ram);
  const [storage, setStorage] = useState(m.storage);
  const [upgradeCost, setUpgradeCost] = useState<number | "">("");

  const upgraded = ram !== m.ram || storage !== m.storage;
  const canReady = !!grade && wiped && (m.type === "Desktop" || battery !== "");

  const [busy, setBusy] = useState(false);
  const save = async (outcome: "ready" | "repair" | "scrap") => {
    setBusy(true);
    const res = await checkMachine({
      id: m.id,
      failed,
      battery: battery === "" ? undefined : battery,
      wiped,
      grade,
      outcome,
      upgrade: upgraded ? { ram, storage, cost: upgradeCost || 0 } : undefined,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(
      outcome === "ready"
        ? `${m.model} is ready to sell — Grade ${grade}`
        : outcome === "repair"
          ? `${m.model} sent to repair`
          : `${m.model} marked as scrap`,
      { description: remaining > 0 ? "Opening the next machine." : "That was the last one." },
    );
    onDone();
  };

  return (
    <div>
      <MachineHead m={m} label={`Checking · ${remaining} more after this`} />

      <Step n={1} title="Tap anything that doesn’t work">
        <div className="flex flex-wrap gap-2">
          {tests.map((t) => {
            const bad = failed.includes(t);
            return (
              <button
                key={t}
                onClick={() => setFailed((f) => (bad ? f.filter((x) => x !== t) : [...f, t]))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                  bad ? "border-st-repair bg-st-repair-bg text-st-repair" : "border-line bg-surface text-ink-2",
                )}
              >
                {bad ? <X className="size-4" /> : <Check className="size-4 text-st-ready" />}
                {t}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[13px] text-ink-3">
          {failed.length ? `${failed.length} problem${failed.length > 1 ? "s" : ""} found` : "Everything works"}
        </p>
      </Step>

      {m.type === "Laptop" && (
        <Step n={2} title="Battery health">
          <div className="flex flex-wrap items-center gap-2">
            {[95, 85, 75, 60].map((b) => (
              <button
                key={b}
                onClick={() => setBattery(b)}
                className={cn(
                  "rounded-xl border px-3.5 py-2 text-sm font-semibold",
                  battery === b ? "border-brand bg-brand-soft text-brand-deep" : "border-line",
                )}
              >
                {b}%
              </button>
            ))}
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="Other %"
              value={battery}
              onChange={(e) => setBattery(e.target.value === "" ? "" : Math.min(100, +e.target.value))}
              className="w-28"
            />
          </div>
        </Step>
      )}

      <Step n={m.type === "Laptop" ? 3 : 2} title="Upgrade RAM or storage? (optional)">
        <div className="grid grid-cols-3 gap-2">
          <Field label="RAM">
            <Select value={ram} onChange={(e) => setRam(+e.target.value)}>
              {[4, 8, 16, 32].filter((v) => v >= m.ram).map((v) => (
                <option key={v} value={v}>
                  {v} GB
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Storage">
            <Select value={storage} onChange={(e) => setStorage(+e.target.value)}>
              {[128, 256, 500, 512, 1024].filter((v) => v >= m.storage).map((v) => (
                <option key={v} value={v}>
                  {v} GB
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cost ₹">
            <Input
              type="number"
              disabled={!upgraded}
              value={upgradeCost}
              placeholder="0"
              onChange={(e) => setUpgradeCost(e.target.value === "" ? "" : +e.target.value)}
            />
          </Field>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">Now: {m.ram} GB RAM, {m.storage} GB {m.storageType}</p>
        {upgraded && <p className="mt-1 text-[13px] text-brand">The machine&apos;s spec will be updated, so it shows in the right place in ready stock.</p>}
      </Step>

      <Step n={m.type === "Laptop" ? 4 : 3} title="Grade the body">
        <GradePicker grade={grade} setGrade={setGrade} />
      </Step>

      <Step n={m.type === "Laptop" ? 5 : 4} title="Wipe the data">
        <button
          onClick={() => setWiped(!wiped)}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition",
            wiped ? "border-st-ready bg-st-ready-bg" : "border-line",
          )}
        >
          <span className={cn("grid size-7 place-items-center rounded-lg border-2", wiped ? "border-st-ready bg-st-ready text-white" : "border-line")}>
            {wiped && <Check className="size-4" />}
          </span>
          <span>
            <span className="block font-semibold">Old data is fully wiped</span>
            <span className="block text-[13px] text-ink-2">Buyers like Cashify expect proof for every serial number.</span>
          </span>
          <ShieldCheck className={cn("ml-auto size-5", wiped ? "text-st-ready" : "text-ink-3")} />
        </button>
      </Step>

      <div className="sticky bottom-0 space-y-2 bg-surface/95 px-5 py-4 backdrop-blur">
        <Button size="lg" className="w-full" disabled={!canReady || busy} onClick={() => save("ready")}>
          <Check /> Mark ready to sell{grade ? ` — Grade ${grade}` : ""}
        </Button>
        {!canReady && (
          <p className="text-center text-[12.5px] text-ink-3">
            To mark ready: {[m.type === "Laptop" && battery === "" && "add battery health", !grade && "pick a grade", !wiped && "confirm the wipe"].filter(Boolean).join(", ")}.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => save("repair")} disabled={!failed.length || busy}>
            <Wrench /> Send to repair
          </Button>
          <Button variant="outline" onClick={() => save("scrap")} disabled={busy} className="text-st-scrap">
            <Trash2 /> Scrap / parts
          </Button>
        </div>
      </div>
    </div>
  );
}

function RepairForm({ m, onDone }: { m: Machine; onDone: () => void }) {
  const finishRepair = useStore((s) => s.finishRepair);
  const [part, setPart] = useState(m.failedChecks?.join(", ") ? `${m.failedChecks.join(", ")} fixed` : "");
  const [cost, setCost] = useState<number | "">("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <MachineHead m={m} label="Finish repair" />
      {m.failedChecks && (
        <p className="mx-5 mt-5 rounded-xl bg-st-repair-bg px-3.5 py-2.5 text-sm text-st-repair">
          <b>Failed checks:</b> {m.failedChecks.join(", ")}
        </p>
      )}
      <Step n={1} title="What was fixed">
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label="Part or work done">
            <Input value={part} onChange={(e) => setPart(e.target.value)} placeholder="e.g. New keyboard" />
          </Field>
          <Field label="Cost ₹">
            <Input type="number" value={cost} placeholder="0" onChange={(e) => setCost(e.target.value === "" ? "" : +e.target.value)} />
          </Field>
        </div>
      </Step>
      <Step n={2} title="Grade the body">
        <GradePicker grade={grade} setGrade={setGrade} />
      </Step>
      <div className="px-5 py-4">
        <Button
          size="lg"
          className="w-full"
          disabled={!grade || !part.trim() || busy}
          onClick={async () => {
            setBusy(true);
            const res = await finishRepair(m.id, part.trim(), cost || 0, grade!);
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success(`${m.model} repaired and ready to sell — Grade ${grade}`);
            onDone();
          }}
        >
          <Check /> Repaired — mark ready to sell
        </Button>
      </div>
    </div>
  );
}
