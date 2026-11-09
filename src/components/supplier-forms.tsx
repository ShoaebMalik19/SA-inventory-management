"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { batchMoney } from "@/lib/data/selectors";
import { PAYMENT_MODES, SUPPLIER_TYPES, type Batch, type PaymentMode, type Supplier } from "@/lib/data/types";
import { STATES } from "@/lib/gst";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ModeChips({ value, onChange }: { value: PaymentMode; onChange: (m: PaymentMode) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PAYMENT_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn("rounded-full border px-3.5 py-2 text-sm font-semibold", value === m ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/** Pay a supplier against one purchase batch. */
export function PaySupplier({ batch, onClose }: { batch: Batch | null; onClose: () => void }) {
  return (
    <Sheet open={!!batch} onOpenChange={(o) => !o && onClose()} title="Pay supplier" side="center">
      {batch && <PayForm key={batch.id} batch={batch} onDone={onClose} />}
    </Sheet>
  );
}

function PayForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const payments = useStore((s) => s.supplierPayments);
  const paySupplier = useStore((s) => s.paySupplier);
  const { balance, paid } = batchMoney(batch, payments);
  const [amount, setAmount] = useState<number | "">(balance);
  const [mode, setMode] = useState<PaymentMode>("Bank transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4 p-5 pt-14">
      <div>
        <p className="text-[13.5px] font-semibold text-ink-3">
          Batch {batch.code}
          {batch.billNo ? ` · their bill ${batch.billNo}` : ""}
        </p>
        <h2 className="font-display text-2xl font-bold">Pay {batch.supplier}</h2>
        <p className="text-sm text-ink-2">
          {rupees(balance)} still owed on {rupees(batch.totalCost)}
          {paid > 0 ? ` (${rupees(paid)} already paid)` : ""}.
        </p>
      </div>
      <Field label="Amount paid (₹)">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : +e.target.value)} />
      </Field>
      <div>
        <p className="text-sm font-semibold">How did you pay?</p>
        <div className="mt-2">
          <ModeChips value={mode} onChange={setMode} />
        </div>
      </div>
      <Field label="Reference (optional)" hint="UTR number, cheque number, or a note">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Button
        size="lg"
        className="w-full"
        disabled={busy || !amount}
        onClick={async () => {
          setBusy(true);
          const res = await paySupplier({ batchId: batch.id, amount: amount || 0, mode, reference });
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          toast.success(`${rupees(amount || 0)} paid to ${batch.supplier}`);
          onDone();
        }}
      >
        <HandCoins /> Save payment
      </Button>
    </div>
  );
}

export function SupplierForm({ initial, onDone }: { initial: Supplier; onDone: () => void }) {
  const saveSupplier = useStore((s) => s.saveSupplier);
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Supplier>(k: K, val: Supplier[K]) => setV({ ...v, [k]: val });
  return (
    <div className="space-y-4 p-5 pt-14">
      <h2 className="font-display text-2xl font-bold">Edit supplier</h2>
      <Field label="Name">
        <Input value={v.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind of supplier" className="col-span-2 sm:col-span-1">
          <Select value={v.kind} onChange={(e) => set("kind", e.target.value as Supplier["kind"])}>
            {SUPPLIER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="We pay within (days)" className="col-span-2 sm:col-span-1" hint="0 = pay on pickup">
          <Input type="number" min={0} max={365} value={v.termsDays} onChange={(e) => set("termsDays", Math.max(0, +e.target.value || 0))} />
        </Field>
        <Field label="Phone (optional)" className="col-span-2 sm:col-span-1">
          <Input inputMode="tel" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="GSTIN (optional)" className="col-span-2 sm:col-span-1">
          <Input value={v.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className="font-mono" />
        </Field>
        <Field label="State" className="col-span-2 sm:col-span-1">
          <Select value={v.state} onChange={(e) => set("state", e.target.value)}>
            {STATES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Address (optional)" className="col-span-2 sm:col-span-1">
          <Input value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </div>
      <p className="text-[13px] text-ink-3">Payment days apply to new batches. Batches already added keep their due date.</p>
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await saveSupplier(v);
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          toast.success("Supplier saved");
          onDone();
        }}
      >
        Save supplier
      </Button>
    </div>
  );
}
