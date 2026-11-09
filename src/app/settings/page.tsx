"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useStore } from "@/lib/data/store";
import type { BusinessSettings } from "@/lib/data/types";
import { STATES } from "@/lib/gst";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  if (!settings) return null;
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} />;
}

function SettingsForm({ initial }: { initial: BusinessSettings }) {
  const saveSettings = useStore((s) => s.saveSettings);
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const changed = JSON.stringify(s) !== JSON.stringify(initial);

  return (
    <div>
      <PageHeader
        title="Settings"
        sub="Your business details, printed on every invoice. Changes apply to new invoices only."
        actions={
          <Button
            size="lg"
            disabled={!changed || busy}
            onClick={async () => {
              setBusy(true);
              const res = await saveSettings(s);
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Settings saved");
            }}
          >
            <Save /> Save settings
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">Business</h2>
          <Field label="Business name">
            <Input value={s.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>
          <Field label="Address">
            <Textarea value={s.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input inputMode="tel" value={s.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="State">
              <Select value={s.state} onChange={(e) => set("state", e.target.value)}>
                {STATES.map((x) => (
                  <option key={x.code} value={x.name}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="GSTIN" hint="15 characters. Without it, bills print as plain invoices.">
            <Input value={s.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className="font-mono" placeholder="29XXXXXXXXXXXXX" />
          </Field>
          <Field label="Bank and UPI details (printed on big-order invoices)">
            <Textarea value={s.bankDetails} onChange={(e) => set("bankDetails", e.target.value)} placeholder={"Bank name, account name\nAccount no. · IFSC\nUPI ID"} />
          </Field>
        </section>

        <section className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">GST and invoices</h2>
          <div>
            <p className="text-sm font-semibold">How do you pay GST on used machines?</p>
            <div className="mt-2 grid gap-2">
              {(
                [
                  ["margin", "Margin scheme", "GST only on (selling price − buying price). Usual for second-hand dealers who don't claim input tax credit."],
                  ["normal", "Normal GST", "GST on the full selling price. Buyers can claim input tax credit."],
                ] as const
              ).map(([k, title, hint]) => (
                <button
                  key={k}
                  onClick={() => set("gstScheme", k)}
                  className={cn("rounded-xl border-2 px-4 py-3 text-left", s.gstScheme === k ? "border-brand bg-brand-soft" : "border-line")}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-[13px] text-ink-2">{hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">Not sure? Ask your CA — this changes the tax on every invoice.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="GST rate">
              <Select value={s.gstRate} onChange={(e) => set("gstRate", +e.target.value)}>
                {[5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice prefix">
              <Input value={s.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} className="font-mono" />
            </Field>
            <Field label="Warranty (months)">
              <Input type="number" min={0} max={24} value={s.warrantyMonths} onChange={(e) => set("warrantyMonths", +e.target.value || 0)} />
            </Field>
          </div>
          <p className="rounded-xl bg-mist px-3.5 py-2.5 text-[13px] text-ink-2">
            Next invoice number looks like <span className="font-mono font-semibold text-ink">{s.invoicePrefix || "INV"}/26-27/0001</span> — numbers restart every
            financial year (April).
          </p>
          <Field label="Note at the bottom of every invoice">
            <Textarea value={s.invoiceNote} onChange={(e) => set("invoiceNote", e.target.value)} />
          </Field>
        </section>
      </div>
    </div>
  );
}
