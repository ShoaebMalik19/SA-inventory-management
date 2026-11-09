"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Buyer } from "@/lib/data/types";
import { STATES } from "@/lib/gst";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";

export type BuyerDraft = Omit<Buyer, "id">;

/** The buyer details that go on invoices. Used inline in a new big order, and on its own to edit a buyer. */
export function BuyerFields({ value, onChange }: { value: BuyerDraft; onChange: (b: BuyerDraft) => void }) {
  const set = <K extends keyof BuyerDraft>(k: K, v: BuyerDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="State" className="col-span-2 sm:col-span-1" hint="Decides CGST + SGST or IGST">
        <Select value={value.state} onChange={(e) => set("state", e.target.value)}>
          {STATES.map((s) => (
            <option key={s.code} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pays within (days)" className="col-span-2 sm:col-span-1" hint="Credit period after dispatch">
        <Input type="number" min={0} max={180} value={value.termsDays} onChange={(e) => set("termsDays", Math.max(0, +e.target.value || 0))} />
      </Field>
      <Field label="GSTIN (optional)" className="col-span-2 sm:col-span-1">
        <Input value={value.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" className="font-mono" />
      </Field>
      <Field label="Phone (optional)" className="col-span-2 sm:col-span-1">
        <Input inputMode="tel" value={value.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Billing address (optional)" className="col-span-2">
        <Input value={value.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </Field>
    </div>
  );
}

export function BuyerForm({ initial, onDone }: { initial: Buyer; onDone: () => void }) {
  const saveBuyer = useStore((s) => s.saveBuyer);
  const [b, setB] = useState<BuyerDraft>(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4 p-5 pt-14">
      <Field label="Buyer name">
        <Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
      </Field>
      <BuyerFields value={b} onChange={setB} />
      <p className="text-[13px] text-ink-3">Changes apply to new invoices. Invoices already made keep the details they were printed with.</p>
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await saveBuyer({ ...b, id: initial.id });
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          toast.success("Buyer saved");
          onDone();
        }}
      >
        Save buyer
      </Button>
    </div>
  );
}
