"use client";

import type { Grade, MachineType, Requirement } from "@/lib/data/types";
import { Field, Input, Select } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

/** What a buyer is asking for. Used by Ready stock and Big orders. */
export function RequirementFields({
  need,
  onChange,
  className,
}: {
  need: Requirement;
  onChange: (n: Requirement) => void;
  className?: string;
}) {
  const set = <K extends keyof Requirement>(k: K, v: Requirement[K]) => onChange({ ...need, [k]: v });
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      <Field label="How many">
        <Input type="number" min={1} value={need.qty} onChange={(e) => set("qty", Math.max(1, +e.target.value || 1))} />
      </Field>
      <Field label="Type">
        <Select value={need.type} onChange={(e) => set("type", e.target.value as MachineType)}>
          <option>Laptop</option>
          <option>Desktop</option>
        </Select>
      </Field>
      <Field label="Processor">
        <Select value={need.cpu} onChange={(e) => set("cpu", e.target.value)}>
          <option value="Core i3">i3</option>
          <option value="Core i5">i5</option>
          <option value="Core i7">i7</option>
        </Select>
      </Field>
      <Field label="Gen or newer">
        <Select value={need.minGen} onChange={(e) => set("minGen", +e.target.value)}>
          {[7, 8, 9, 10, 11].map((g) => (
            <option key={g} value={g}>
              {g}th gen
            </option>
          ))}
        </Select>
      </Field>
      <Field label="RAM at least">
        <Select value={need.ram} onChange={(e) => set("ram", +e.target.value)}>
          {[4, 8, 16].map((g) => (
            <option key={g} value={g}>
              {g} GB
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Storage at least">
        <Select value={need.storage} onChange={(e) => set("storage", +e.target.value)}>
          {[128, 256, 512].map((g) => (
            <option key={g} value={g}>
              {g} GB
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Grade or better">
        <Select value={need.grade} onChange={(e) => set("grade", e.target.value as Grade)}>
          <option value="A">A only</option>
          <option value="B">A or B</option>
          <option value="C">Any grade</option>
        </Select>
      </Field>
    </div>
  );
}

export const needLabel = (n: Requirement) =>
  `${n.qty} × ${n.type.toLowerCase()} · ${n.cpu.replace("Core ", "")} ${n.minGen}th gen+ · ${n.ram} GB+ · ${n.storage} GB+ · ${
    n.grade === "A" ? "Grade A" : n.grade === "B" ? "Grade A/B" : "any grade"
  }`;
