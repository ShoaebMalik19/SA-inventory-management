"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Printer, ScanLine, Store } from "lucide-react";
import { useStore } from "@/lib/data/store";
import type { Machine, ShopSale } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { GradeBadge, StagePill } from "@/components/stage";
import { dateTime, ordinal, rupees, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SaleView({ initialId }: { initialId?: string }) {
  const machines = useStore((s) => s.machines);
  const sales = useStore((s) => s.sales);
  const orders = useStore((s) => s.orders);
  const shopSell = useStore((s) => s.shopSell);

  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState<number | "">(() => machines.find((m) => m.id === initialId)?.price || "");
  const [warranty, setWarranty] = useState(3);
  const [receipt, setReceipt] = useState<ShopSale | null>(null);

  const selected = selectedId ? machines.find((m) => m.id === selectedId) : undefined;
  const bookedOrder = selected?.stage === "booked" ? orders.find((o) => o.id === selected.orderId) : undefined;

  const results = useMemo(() => {
    if (!query) return [];
    return machines
      .filter((m) => m.stage === "ready" || m.stage === "booked")
      .filter((m) => {
        const hay = `${m.serial} ${m.brand} ${m.model} ${m.cpu} ${m.gen}th ${m.ram}gb`.toLowerCase();
        return query.split(/\s+/).every((w) => hay.includes(w));
      })
      .sort((a, b) => (a.stage === "ready" ? 0 : 1) - (b.stage === "ready" ? 0 : 1) || (a.location === "Shop" ? 0 : 1) - (b.location === "Shop" ? 0 : 1))
      .slice(0, 8);
  }, [machines, query]);

  const choose = (m: Machine) => {
    setSelectedId(m.id);
    setPrice(m.price || "");
    setQ("");
  };

  const sell = () => {
    if (!selected) return;
    const res = shopSell(selected.id, customer.trim(), phone.trim(), price || 0, warranty);
    if (!res.ok) return toast.error(res.reason);
    toast.success(`Sold — ${selected.brand} ${selected.model} to ${customer.trim()}`);
    setReceipt(res.sale);
    setSelectedId(null);
    setCustomer("");
    setPhone("");
    setPrice("");
  };

  const canSell = selected?.stage === "ready" && customer.trim() && /^\d{10}$/.test(phone.trim()) && price;
  const recent = sales.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  return (
    <div>
      <PageHeader title="Shop sale" sub="Sell one machine to a walk-in customer. Machines booked for big orders can't be sold here." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">1. Find the machine</h2>
          <div className="relative mt-3">
            <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) choose(results[0]);
              }}
              placeholder="Scan the serial, or type a model like “T480”"
              className="h-14 rounded-2xl pl-12 text-[16px]"
            />
            {results.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_50px_-20px_rgba(15,42,38,.35)]">
                {results.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => choose(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-mist">
                      <GradeBadge grade={m.grade} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {m.brand} {m.model}
                        </span>
                        <span className="block truncate text-[13px] text-ink-3">
                          <span className="font-mono">{m.serial}</span> · {m.ram}/{m.storage} GB · {m.location}
                        </span>
                      </span>
                      {m.stage === "booked" ? <StagePill stage="booked" /> : <span className="text-sm font-semibold">{rupees(m.price)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!selected ? (
            <div className="mt-5 rounded-2xl bg-mist px-5 py-10 text-center text-ink-2">Scan or search to pick the machine the customer wants.</div>
          ) : (
            <div
              className={cn(
                "mt-5 rounded-2xl border-2 p-5",
                selected.stage === "booked" ? "border-st-scrap bg-st-scrap-bg/50" : selected.stage === "ready" ? "border-ink" : "border-line",
              )}
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-3">
                    {selected.type} · at the {selected.location.toLowerCase()}
                  </p>
                  <h3 className="font-display text-[24px] font-bold leading-tight">
                    {selected.brand} {selected.model}
                  </h3>
                  <p className="mt-1 text-sm text-ink-2">
                    <span className="font-mono text-ink">{selected.serial}</span> · {selected.cpu} {ordinal(selected.gen)} gen · {selected.ram} GB ·{" "}
                    {selected.storage} GB {selected.storageType}
                    {selected.battery ? ` · battery ${selected.battery}%` : ""}
                  </p>
                  <StagePill stage={selected.stage} className="mt-3" />
                </div>
                <GradeBadge grade={selected.grade} size="lg" />
              </div>
              {selected.stage === "booked" && (
                <div className="mt-4 flex items-start gap-3 rounded-xl bg-st-scrap px-4 py-3 text-white">
                  <Ban className="mt-0.5 size-5 shrink-0" />
                  <p className="text-[14.5px]">
                    <b>Don&apos;t sell this one.</b> It is booked for big order {bookedOrder?.code} ({bookedOrder?.buyer}). Pick another machine
                    with the same spec.
                  </p>
                </div>
              )}
              {selected.stage === "sold" && <p className="mt-4 text-sm text-st-sold">Already sold to {selected.soldTo}.</p>}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6 lg:self-start">
          <h2 className="font-display text-lg font-bold">2. Customer & price</h2>
          <div className="mt-4 space-y-3">
            <Field label="Customer name">
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Phone number" hint="10 digits. Used for the warranty.">
              <Input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98450 00000" />
            </Field>
            <Field label="Selling price (₹)" hint={selected?.price ? `Asking price: ${rupees(selected.price)}` : undefined}>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)} />
            </Field>
            <Field label="Warranty">
              <div className="grid grid-cols-3 gap-2">
                {[1, 3, 6].map((w) => (
                  <button
                    key={w}
                    onClick={() => setWarranty(w)}
                    className={cn(
                      "h-11 rounded-[11px] border text-sm font-semibold",
                      warranty === w ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2",
                    )}
                  >
                    {w} month{w > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </Field>
            {selected && price && selected.stage === "ready" ? (
              <p className="rounded-xl bg-mist px-3.5 py-2.5 text-sm text-ink-2">
                Profit on this sale:{" "}
                <b className={cn(price - selected.cost - selected.repairCost >= 0 ? "text-st-ready" : "text-st-scrap")}>
                  {rupees(price - selected.cost - selected.repairCost)}
                </b>
              </p>
            ) : null}
          </div>
          <Button size="lg" className="mt-5 w-full" disabled={!canSell} onClick={sell}>
            <Store /> Complete sale{price ? ` — ${rupees(price)}` : ""}
          </Button>
        </section>
      </div>

      <section className="mt-5 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Recent shop sales</h2>
        <ul className="mt-3 divide-y divide-line-soft">
          {recent.map((s) => {
            const m = byId.get(s.machineId);
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {m?.brand} {m?.model} <span className="font-normal text-ink-3">to {s.customer}</span>
                  </p>
                  <p className="text-[13px] text-ink-3">
                    {s.code} · {timeAgo(s.at)} · {s.warrantyMonths} months warranty
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{rupees(s.price)}</span>
                <Button variant="ghost" size="icon" aria-label="Show warranty slip" onClick={() => setReceipt(s)}>
                  <Printer />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} title="Warranty slip" side="center">
        {receipt && <Slip sale={receipt} m={byId.get(receipt.machineId)} />}
      </Sheet>
    </div>
  );
}

function Slip({ sale, m }: { sale: ShopSale; m?: Machine }) {
  const until = new Date(new Date(sale.at).getTime() + sale.warrantyMonths * 30 * 86_400_000);
  return (
    <div className="p-5 pt-16">
      <div className="print-area rounded-2xl border-2 border-ink p-5">
        <div className="flex items-start justify-between border-b-2 border-dashed border-ink/25 pb-4">
          <div>
            <p className="font-display text-xl font-bold">S.A Computers</p>
            <p className="text-[13px] text-ink-2">KHB Main Road, RT Nagar, Bengaluru</p>
          </div>
          <div className="text-right text-[13px]">
            <p className="font-semibold">{sale.code}</p>
            <p className="text-ink-2">{dateTime(sale.at)}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-[14.5px]">
          {[
            ["Customer", `${sale.customer}, ${sale.phone}`],
            ["Machine", `${m?.brand} ${m?.model}`],
            ["Spec", m ? `${m.cpu} ${ordinal(m.gen)} gen · ${m.ram} GB · ${m.storage} GB ${m.storageType}` : ""],
            ["Serial number", m?.serial ?? ""],
            ["Grade", m?.grade ?? ""],
            ["Warranty", `${sale.warrantyMonths} months, until ${until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-ink-2">{k}</dt>
              <dd className={cn("text-right font-semibold", k === "Serial number" && "font-mono")}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <span className="font-semibold">Amount paid</span>
          <span className="font-display text-2xl font-bold">{rupees(sale.price)}</span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Warranty covers hardware faults. Physical or liquid damage is not covered. Keep this slip for any claim.
        </p>
      </div>
      <Button size="lg" className="mt-4 w-full" onClick={() => window.print()}>
        <Printer /> Print warranty slip
      </Button>
    </div>
  );
}
