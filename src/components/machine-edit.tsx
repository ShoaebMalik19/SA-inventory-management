"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { can } from "@/lib/roles";
import type { Grade, Machine } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

/** Correct a machine's details when something was typed wrong. Every change is logged with before → after. */
export function MachineEdit({ m, onDone }: { m: Machine; onDone: () => void }) {
  const role = useStore((s) => s.user?.role);
  const editMachine = useStore((s) => s.editMachine);
  const money = can(role, "viewMoney");
  const [f, setF] = useState({
    serial: m.serial,
    brand: m.brand,
    model: m.model,
    cpu: m.cpu,
    gen: m.gen,
    ram: m.ram,
    storage: m.storage,
    storageType: m.storageType,
    battery: m.battery ?? ("" as number | ""),
    grade: m.grade,
    cost: m.cost,
    price: m.price,
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const checked = m.stage === "ready" || m.stage === "booked";

  const save = async () => {
    setBusy(true);
    const res = await editMachine({
      id: m.id,
      serial: f.serial,
      brand: f.brand,
      model: f.model,
      cpu: f.cpu,
      gen: Number(f.gen),
      ram: Number(f.ram),
      storage: Number(f.storage),
      storageType: f.storageType,
      battery: m.type === "Laptop" ? (f.battery === "" ? null : Number(f.battery)) : undefined,
      grade: checked && f.grade ? f.grade : undefined,
      cost: money ? Number(f.cost) : undefined,
      price: money && m.stage === "ready" ? Number(f.price) : undefined,
      reason,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Details corrected", { description: "The change is saved in the machine's history." });
    onDone();
  };

  return (
    <div className="mx-5 mt-5 rounded-2xl border-2 border-brand/40 bg-brand-soft/40 p-4">
      <p className="font-display text-lg font-bold">Correct the details</p>
      <p className="text-sm text-ink-2">Fix anything typed wrong. The old and new values are both kept in the history.</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Field label="Serial number" className="col-span-2">
          <Input value={f.serial} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => set("serial", e.target.value.toUpperCase())} className="font-mono" />
        </Field>
        <Field label="Brand">
          <Input value={f.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Model">
          <Input value={f.model} onChange={(e) => set("model", e.target.value)} />
        </Field>
        <Field label="Processor">
          <Select value={f.cpu} onChange={(e) => set("cpu", e.target.value)}>
            {[...new Set([f.cpu, "Core i3", "Core i5", "Core i7", "Core i9", "Ryzen 3", "Ryzen 5", "Ryzen 7", "Pentium", "Celeron"])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Generation">
          <Input type="number" inputMode="numeric" value={f.gen} onChange={(e) => set("gen", +e.target.value)} />
        </Field>
        <Field label="RAM (GB)">
          <Select value={f.ram} onChange={(e) => set("ram", +e.target.value)}>
            {[...new Set([f.ram, 2, 4, 8, 12, 16, 24, 32, 64])].sort((a, b) => a - b).map((v) => (
              <option key={v} value={v}>
                {v} GB
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Storage (GB)">
          <Select value={f.storage} onChange={(e) => set("storage", +e.target.value)}>
            {[...new Set([f.storage, 128, 256, 320, 500, 512, 1000, 1024, 2048])].sort((a, b) => a - b).map((v) => (
              <option key={v} value={v}>
                {v} GB
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Storage type">
          <div className="grid grid-cols-2 gap-1.5">
            {(["SSD", "HDD"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("storageType", t)}
                className={cn("h-11 rounded-[11px] border text-sm font-semibold", f.storageType === t ? "border-brand bg-brand-soft text-brand-deep" : "border-line bg-surface text-ink-2")}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        {m.type === "Laptop" && (
          <Field label="Battery %">
            <Input type="number" inputMode="numeric" value={f.battery} placeholder="Not checked" onChange={(e) => set("battery", e.target.value === "" ? "" : +e.target.value)} />
          </Field>
        )}
        {checked && (
          <Field label="Grade" className="col-span-2">
            <div className="grid grid-cols-3 gap-1.5">
              {(["A", "B", "C"] as Grade[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set("grade", g)}
                  className={cn("h-11 rounded-[11px] border font-display text-lg font-bold", f.grade === g ? "border-brand bg-brand-soft text-brand-deep" : "border-line bg-surface")}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>
        )}
        {money && (
          <Field label="Bought for ₹">
            <Input type="number" inputMode="numeric" value={f.cost} onChange={(e) => set("cost", +e.target.value)} />
          </Field>
        )}
        {money && m.stage === "ready" && (
          <Field label="Asking price ₹">
            <Input type="number" inputMode="numeric" value={f.price} onChange={(e) => set("price", +e.target.value)} />
          </Field>
        )}
        <Field label="Why (optional)" className="col-span-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Serial typed wrong at stock-in" />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="lg" disabled={busy} onClick={save}>
          <Save /> Save changes
        </Button>
        <Button size="lg" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
