"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Ban, CheckCircle2, MessageCircle, Printer, ScanLine, Store } from "lucide-react";
import { can } from "@/lib/roles";
import { useStore } from "@/lib/data/store";
import { PAYMENT_MODES, type Machine, type PaymentMode, type ShopSale } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { ScanButton } from "@/components/scan-button";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { GradeBadge, StagePill } from "@/components/stage";
import { ordinal, rupees, timeAgo } from "@/lib/format";
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
  const settings = useStore((s) => s.settings);
  const role = useStore((s) => s.user?.role);
  const invoices = useStore((s) => s.invoices);
  const [warranty, setWarranty] = useState(settings?.warrantyMonths ?? 3);
  const [mode, setMode] = useState<PaymentMode>("Cash");
  const [reference, setReference] = useState("");
  const [done, setDone] = useState<{ sale: ShopSale; invoiceId: string } | null>(null);

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

  const step2 = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const choose = (m: Machine) => {
    setSelectedId(m.id);
    setPrice(m.price || "");
    setQ("");
    navigator.vibrate?.(30);
    // on a phone, move straight on to the customer's details
    if (m.stage === "ready" && window.matchMedia("(max-width: 1023px)").matches)
      setTimeout(() => {
        step2.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        nameRef.current?.focus({ preventScroll: true });
      }, 250);
  };
  const onScan = (t: string) => {
    const hit = machines.find((m) => m.serial.toLowerCase() === t.toLowerCase());
    if (hit) choose(hit);
    else {
      navigator.vibrate?.([80, 60, 80]);
      toast.error(`No machine with serial ${t}`);
    }
  };

  const [busy, setBusy] = useState(false);
  const sell = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await shopSell({
      machineId: selected.id,
      customer: customer.trim(),
      phone: phone.trim(),
      price: price || 0,
      warrantyMonths: warranty,
      paymentMode: mode,
      reference,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Sold — ${selected.brand} ${selected.model} to ${customer.trim()}`);
    setDone({ sale: res.sale, invoiceId: res.invoiceId });
    setReference("");
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
          <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) choose(results[0]);
              }}
              placeholder="Serial, or a model like “T480”"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-14 rounded-2xl pl-12 text-[16px]"
            />
            {results.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_50px_-20px_rgba(15,42,38,.35)]">
                {results.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => choose(m)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-mist">
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
          <ScanButton className="h-14 rounded-2xl" onScan={onScan} />
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

        <section ref={step2} className="scroll-mt-20 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6 lg:self-start">
          <h2 className="font-display text-lg font-bold">2. Customer & price</h2>
          <div className="mt-4 space-y-3">
            <Field label="Customer name">
              <Input ref={nameRef} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Full name" autoCapitalize="words" autoComplete="off" enterKeyHint="next" />
            </Field>
            <Field label="Phone number" hint="10 digits. Used for the warranty.">
              <Input type="tel" inputMode="numeric" autoComplete="off" enterKeyHint="next" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98450 00000" />
            </Field>
            <Field label="Selling price (₹)" hint={selected?.price ? `Asking price: ${rupees(selected.price)}` : undefined}>
              <Input type="number" inputMode="numeric" enterKeyHint="done" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)} />
            </Field>
            <Field label="Warranty">
              <div className="grid grid-cols-3 gap-2">
                {[1, 3, 6].map((w) => (
                  <button
                    key={w}
                    onClick={() => setWarranty(w)}
                    className={cn(
                      "h-12 rounded-[11px] border text-sm font-semibold sm:h-11",
                      warranty === w ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2",
                    )}
                  >
                    {w} month{w > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Paid by">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {PAYMENT_MODES.filter((m) => m !== "Cheque").map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "h-12 rounded-[11px] border px-3.5 text-sm font-semibold sm:h-10",
                      mode === m ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-2",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>
            {mode !== "Cash" && (
              <Field label="Transaction ID (optional)">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / card reference" />
              </Field>
            )}
            {selected && price && selected.stage === "ready" && can(role, "viewMoney") ? (
              <p className="rounded-xl bg-mist px-3.5 py-2.5 text-sm text-ink-2">
                Profit on this sale:{" "}
                <b className={cn(price - selected.cost - selected.repairCost >= 0 ? "text-st-ready" : "text-st-scrap")}>
                  {rupees(price - selected.cost - selected.repairCost)}
                </b>
              </p>
            ) : null}
          </div>
          <Button size="lg" className="mt-5 hidden w-full lg:inline-flex" disabled={!canSell || busy} onClick={sell}>
            <Store /> Complete sale{price ? ` — ${rupees(price)}` : ""}
          </Button>
        </section>
      </div>

      {/* phone: the next step is always at the thumb */}
      <div className="fixed inset-x-0 bottom-[calc(62px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        {!selected || selected.stage !== "ready" ? (
          <ScanButton className="h-13 w-full justify-center rounded-2xl py-3.5 text-[16px]" label="Scan the machine" onScan={onScan} />
        ) : (
          <>
            <Button size="lg" className="h-13 w-full rounded-2xl text-[16px]" disabled={!canSell || busy} onClick={sell}>
              <Store /> {busy ? "Saving…" : `Complete sale${price ? ` — ${rupees(price)}` : ""}`}
            </Button>
            {!canSell && (
              <p className="mt-1 text-center text-[12.5px] text-ink-3">
                Still needed: {[!customer.trim() && "name", !/^\d{10}$/.test(phone.trim()) && "10-digit phone", !price && "price"].filter(Boolean).join(", ")}
              </p>
            )}
          </>
        )}
      </div>
      <div className="h-24 lg:hidden" aria-hidden />

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
                {(() => {
                  const inv = invoices.find((i) => i.refId === s.id);
                  return inv ? (
                    <Button asChild variant="ghost" size="icon" aria-label="Open the bill">
                      <Link href={`/invoices/${inv.id}`}>
                        <Printer />
                      </Link>
                    </Button>
                  ) : null;
                })()}
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={!!done} onOpenChange={(o) => !o && setDone(null)} title="Sale complete" side="center">
        {done && (
          <div className="p-6 pt-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-st-ready-bg text-st-ready">
              <CheckCircle2 className="size-7" />
            </span>
            <h2 className="font-display mt-3 text-2xl font-bold">Sold to {done.sale.customer}</h2>
            <p className="mt-1 text-ink-2">
              {rupees(done.sale.price)} received by {mode}. The bill has the warranty on it.
            </p>
            <div className="mt-5 grid gap-2">
              <Button asChild size="lg">
                <Link href={`/invoices/${done.invoiceId}`}>
                  <Printer /> Print the bill
                </Link>
              </Button>
              {/^\d{10}$/.test(done.sale.phone) && (
                <Button asChild size="lg" variant="outline">
                  <a href={waLink(done.sale, settings?.businessName ?? "S.A Computers", settings?.phone ?? "")} target="_blank" rel="noreferrer">
                    <MessageCircle /> Send bill details on WhatsApp
                  </a>
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => setDone(null)}>
                Next customer
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function waLink(sale: ShopSale, shop: string, shopPhone: string) {
  const until = new Date(new Date(sale.at).getTime() + sale.warrantyMonths * 30 * 86_400_000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const text = [`Thank you for buying from ${shop}!`, `Sale ${sale.code} · ${rupees(sale.price)}`, `Warranty until ${until}. Keep this message for warranty claims.`, shopPhone ? `${shop} · ${shopPhone}` : shop].join("\n");
  return `https://wa.me/91${sale.phone}?text=${encodeURIComponent(text)}`;
}
