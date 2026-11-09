"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IndianRupee } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { invoiceMoney } from "@/lib/data/selectors";
import { PAYMENT_MODES, type Invoice, type PaymentMode } from "@/lib/data/types";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RecordPayment({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  return (
    <Sheet open={!!invoice} onOpenChange={(o) => !o && onClose()} title="Record payment" side="center">
      {invoice && <Form key={invoice.id} inv={invoice} onDone={onClose} />}
    </Sheet>
  );
}

function Form({ inv, onDone }: { inv: Invoice; onDone: () => void }) {
  const payments = useStore((s) => s.payments);
  const recordPayment = useStore((s) => s.recordPayment);
  const { balance } = invoiceMoney(inv, payments);
  const [amount, setAmount] = useState<number | "">(balance);
  const [mode, setMode] = useState<PaymentMode>("Bank transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4 p-5 pt-14">
      <div>
        <p className="text-[13.5px] font-semibold text-ink-3">{inv.number}</p>
        <h2 className="font-display text-2xl font-bold">Money from {inv.buyerName}</h2>
        <p className="text-sm text-ink-2">
          {rupees(balance)} still due on this invoice of {rupees(inv.total)}.
        </p>
      </div>
      <Field label="Amount received (₹)">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : +e.target.value)} />
      </Field>
      <div>
        <p className="text-sm font-semibold">How did they pay?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAYMENT_MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("rounded-full border px-3.5 py-2 text-sm font-semibold", mode === m ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2")}
            >
              {m}
            </button>
          ))}
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
          const res = await recordPayment({ invoiceId: inv.id, amount: amount || 0, mode, reference });
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          toast.success(`${rupees(amount || 0)} received from ${inv.buyerName}`);
          onDone();
        }}
      >
        <IndianRupee /> Save payment
      </Button>
    </div>
  );
}
