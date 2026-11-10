"use client";

import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import { useUI } from "@/lib/ui-store";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { ScanButton } from "@/components/scan-button";
import { StagePill } from "@/components/stage";
import { count, rupees, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ReturnsPage() {
  const machines = useStore((s) => s.machines);
  const sales = useStore((s) => s.sales);
  const orders = useStore((s) => s.orders);
  const returns = useStore((s) => s.returns);
  const role = useStore((s) => s.user?.role);
  const openMachine = useUI((s) => s.openMachine);
  const [serial, setSerial] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);

  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const found = lookup ? machines.find((m) => m.serial.toLowerCase() === lookup.toLowerCase()) : undefined;

  const warranty = useMemo(() => {
    if (!found) return null;
    const sale = sales.filter((s) => s.machineId === found.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    const order = found.orderId ? orders.find((o) => o.id === found.orderId) : undefined;
    if (found.stage === "sold" && sale && sale.customer === found.soldTo) {
      const until = new Date(new Date(sale.at).getTime() + sale.warrantyMonths * 30 * 86_400_000);
      const daysLeft = Math.ceil((until.getTime() - new Date().getTime()) / 86_400_000);
      return { kind: "shop" as const, sale, until, daysLeft };
    }
    if (found.stage === "sold" && order) return { kind: "order" as const, order };
    return { kind: "not-sold" as const };
  }, [found, sales, orders]);

  const check = (v = serial) => {
    const t = v.trim();
    if (!t) return;
    if (!machines.some((m) => m.serial.toLowerCase() === t.toLowerCase())) {
      toast.error(`No machine with serial ${t}. Check the number on the sticker.`);
      return setLookup(null);
    }
    setLookup(t);
  };

  const monthAgo = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const recent = returns.filter((r) => r.at > monthAgo);
  const refunds = recent.reduce((s, r) => s + r.refund, 0);

  return (
    <div>
      <PageHeader
        title="Returns & warranty"
        sub="Check if a machine is still under warranty, and record machines customers bring back. Returned machines go back to Check & grade."
      />

      <section className="rounded-[var(--radius-panel)] border-2 border-ink bg-surface p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">Is it under warranty?</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="Type or scan the serial number"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-14 rounded-2xl font-mono text-[16px] sm:flex-1"
          />
          <Button size="lg" className="h-14 rounded-2xl" onClick={() => check()} disabled={!serial.trim()}>
            Check warranty
          </Button>
          <ScanButton
            className="h-14 justify-center rounded-2xl"
            onScan={(t) => {
              setSerial(t);
              check(t);
            }}
          />
        </div>

        {found && warranty && (
          <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-mist p-4 sm:flex-row sm:items-center">
            {warranty.kind === "shop" ? (
              warranty.daysLeft > 0 ? (
                <ShieldCheck className="size-10 shrink-0 text-st-ready" />
              ) : (
                <ShieldAlert className="size-10 shrink-0 text-st-scrap" />
              )
            ) : (
              <ShieldAlert className="size-10 shrink-0 text-ink-3" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-3">
                {found.brand} {found.model} · <span className="font-mono">{found.serial}</span>
              </p>
              {warranty.kind === "shop" && (
                <>
                  <p className={cn("font-display text-[22px] font-bold", warranty.daysLeft > 0 ? "text-st-ready" : "text-st-scrap")}>
                    {warranty.daysLeft > 0 ? `Under warranty — ${warranty.daysLeft} days left` : "Warranty has ended"}
                  </p>
                  <p className="text-sm text-ink-2">
                    Sold to {warranty.sale.customer} on {shortDate(warranty.sale.at)} ({warranty.sale.code}) with {warranty.sale.warrantyMonths} months
                    warranty, until {warranty.until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
                  </p>
                </>
              )}
              {warranty.kind === "order" && (
                <>
                  <p className="font-display text-[22px] font-bold">Sold in a big order</p>
                  <p className="text-sm text-ink-2">
                    Went to {warranty.order.buyer} with {warranty.order.code} on {shortDate(warranty.order.dispatchedAt ?? warranty.order.createdAt)}.
                    Warranty follows your agreement with that buyer.
                  </p>
                </>
              )}
              {warranty.kind === "not-sold" && (
                <>
                  <p className="font-display text-[22px] font-bold">Not sold — it&apos;s still ours</p>
                  <div className="mt-1">
                    <StagePill stage={found.stage} />
                  </div>
                </>
              )}
            </div>
            <Button variant={found.stage === "sold" ? "danger" : "outline"} onClick={() => openMachine(found.id, found.stage === "sold" && can(role, "returns") ? "return" : "view")}>
              {found.stage === "sold" && can(role, "returns") ? (
                <>
                  <Undo2 /> Record a return
                </>
              ) : (
                "Open machine"
              )}
            </Button>
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Returned machines</h2>
        <p className="text-sm text-ink-2">
          {count(recent.length)} in the last 30 days
          {can(role, "viewMoney") && recent.length > 0 && ` · ${rupees(refunds)} refunded`}
        </p>
      </div>

      {returns.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="font-display text-lg font-bold">No returns yet</p>
          <p className="mt-1 text-ink-2">When a customer brings a machine back, check its warranty above and record the return.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
          {returns.map((r) => {
            const m = byId.get(r.machineId);
            return (
              <li key={r.id}>
                <button onClick={() => m && openMachine(m.id)} className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-mist/60 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">
                      {m?.brand} {m?.model} <span className="font-normal text-ink-3">from {r.customer}</span>
                    </p>
                    <p className="text-[13px] text-ink-3">
                      {r.code} · {r.from === "shop" ? "shop sale" : "big order"} {r.refCode} · {shortDate(r.at)}
                      {r.by && ` · recorded by ${r.by}`}
                    </p>
                    <p className="mt-1 text-sm text-ink-2">“{r.reason}”</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {m && <StagePill stage={m.stage} />}
                    {r.refund > 0 && <span className="font-semibold tabular-nums text-st-scrap">−{rupees(r.refund)}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
