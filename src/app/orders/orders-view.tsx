"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { CheckCircle2, CircleAlert, Download, PackageCheck, Plus, Truck, XCircle } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { pickForRequirement } from "@/lib/data/selectors";
import type { BigOrder, Machine, Requirement } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { needLabel, RequirementFields } from "@/components/requirement-fields";
import { count, ordinal, rupees, rupeesShort, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_NEED: Requirement = { type: "Laptop", cpu: "Core i5", minGen: 8, ram: 8, storage: 256, grade: "B", qty: 100 };

const STATUS: Record<BigOrder["status"], { label: string; cls: string }> = {
  booked: { label: "Booked — not dispatched", cls: "bg-st-booked-bg text-st-booked" },
  dispatched: { label: "Dispatched", cls: "bg-st-ready-bg text-st-ready" },
  cancelled: { label: "Cancelled", cls: "bg-st-sold-bg text-st-sold" },
};

function modelBreakdown(ms: Machine[]) {
  const map = new Map<string, number>();
  ms.forEach((m) => map.set(`${m.brand} ${m.model}`, (map.get(`${m.brand} ${m.model}`) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function downloadSerialList(order: BigOrder, machines: Machine[]) {
  const ids = new Set(order.machineIds);
  const rows = machines
    .filter((m) => ids.has(m.id))
    .map((m, i) => ({
      "#": i + 1,
      Serial: m.serial,
      Brand: m.brand,
      Model: m.model,
      Processor: `${m.cpu} ${ordinal(m.gen)} gen`,
      "RAM (GB)": m.ram,
      "Storage (GB)": `${m.storage} ${m.storageType}`,
      Grade: m.grade ?? "",
      "Battery %": m.battery ?? "",
      "Data wiped": m.wiped ? "Yes" : "No",
      "Price (₹)": order.unitPrice,
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, order.code);
  XLSX.writeFile(wb, `${order.code}-${order.buyer.replace(/\W+/g, "-")}-serials.xlsx`);
}

export function OrdersView({ prefill }: { prefill?: Requirement }) {
  const orders = useStore((s) => s.orders);
  const machines = useStore((s) => s.machines);
  const dispatchOrder = useStore((s) => s.dispatchOrder);
  const cancelOrder = useStore((s) => s.cancelOrder);
  const [creating, setCreating] = useState(!!prefill);
  const [busyId, setBusyId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const sorted = [...orders].sort((a, b) => (a.status === "booked" ? -1 : 0) - (b.status === "booked" ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
  const dispatchedValue = orders.filter((o) => o.status === "dispatched").reduce((s, o) => s + o.unitPrice * o.machineIds.length, 0);

  return (
    <div>
      <PageHeader
        title="Big orders"
        sub={`Bulk orders from buyers. Booking sets the machines aside so nobody sells them at the shop. ${count(
          orders.filter((o) => o.status === "dispatched").length,
        )} orders dispatched so far, worth ${rupeesShort(dispatchedValue)}.`}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus /> New big order
          </Button>
        }
      />

      <ul className="space-y-3">
        {sorted.map((o) => {
          const ms = o.machineIds.map((id) => byId.get(id)).filter(Boolean) as Machine[];
          const profit = ms.reduce((s, m) => s + o.unitPrice - m.cost - m.repairCost, 0);
          return (
            <li
              key={o.id}
              className={cn(
                "rounded-[var(--radius-panel)] border bg-surface p-5 sm:p-6",
                o.status === "booked" ? "border-2 border-tag" : "border-line",
              )}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-display text-xl font-bold">{o.buyer}</h2>
                    <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-semibold", STATUS[o.status].cls)}>
                      {STATUS[o.status].label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    {o.code} · booked {shortDate(o.createdAt)}
                    {o.dispatchedAt && ` · dispatched ${shortDate(o.dispatchedAt)}`}
                  </p>
                  <p className="mt-2 text-[14.5px]">
                    Asked for: <b>{needLabel(o.need)}</b>
                  </p>
                  <p className="mt-1.5 text-[13px] text-ink-3">
                    {modelBreakdown(ms)
                      .slice(0, 4)
                      .map(([name, n]) => `${n} × ${name}`)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-6 lg:text-right">
                  <div>
                    <p className="text-[12.5px] text-ink-3">Machines</p>
                    <p className="font-display text-2xl font-bold">{o.machineIds.length}</p>
                  </div>
                  <div>
                    <p className="text-[12.5px] text-ink-3">Order value</p>
                    <p className="font-display text-2xl font-bold">{rupeesShort(o.unitPrice * o.machineIds.length)}</p>
                    <p className="text-[12.5px] text-ink-3">{rupees(o.unitPrice)} each</p>
                  </div>
                  <div>
                    <p className="text-[12.5px] text-ink-3">Profit</p>
                    <p className={cn("font-display text-2xl font-bold", profit >= 0 ? "text-st-ready" : "text-st-scrap")}>
                      {rupeesShort(profit)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">
                <Button variant="outline" size="sm" onClick={() => downloadSerialList(o, machines)}>
                  <Download /> Serial list (Excel)
                </Button>
                {o.status === "booked" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === o.id}
                      onClick={async () => {
                        setBusyId(o.id);
                        const res = await dispatchOrder(o.id);
                        setBusyId(null);
                        if (!res.ok) return toast.error(res.error);
                        toast.success(`${o.code} dispatched to ${o.buyer}`, { description: `${o.machineIds.length} machines marked as sold.` });
                      }}
                    >
                      <PackageCheck /> Mark as dispatched
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-st-scrap"
                      disabled={busyId === o.id}
                      onClick={async () => {
                        if (!confirm(`Cancel ${o.code}? The ${o.machineIds.length} machines go back to ready stock.`)) return;
                        setBusyId(o.id);
                        const res = await cancelOrder(o.id);
                        setBusyId(null);
                        if (!res.ok) return toast.error(res.error);
                        toast.success(`${o.code} cancelled — machines are back in ready stock`);
                      }}
                    >
                      <XCircle /> Cancel order
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={creating} onOpenChange={setCreating} title="New big order">
        {creating && <NewOrderForm initial={prefill ?? DEFAULT_NEED} onDone={() => setCreating(false)} />}
      </Sheet>
    </div>
  );
}

function NewOrderForm({ initial, onDone }: { initial: Requirement; onDone: () => void }) {
  const machines = useStore((s) => s.machines);
  const orders = useStore((s) => s.orders);
  const createOrder = useStore((s) => s.createOrder);
  const buyers = useMemo(() => [...new Set(orders.map((o) => o.buyer))], [orders]);

  const [buyer, setBuyer] = useState(buyers[0] ?? "");
  const [need, setNeed] = useState<Requirement>(initial);
  const [unitPrice, setUnitPrice] = useState<number | "">(17500);
  const [busy, setBusy] = useState(false);

  const { picked, available, shortBy } = useMemo(() => pickForRequirement(machines, need), [machines, need]);
  const cost = picked.reduce((s, m) => s + m.cost + m.repairCost, 0);
  const value = (unitPrice || 0) * picked.length;
  const canBook = buyer.trim() && picked.length > 0 && unitPrice;

  return (
    <div className="pb-6">
      <div className="border-b border-line-soft px-5 pb-5 pt-6">
        <p className="text-[13.5px] font-semibold text-ink-3">New big order</p>
        <h2 className="font-display mt-2 text-[24px] font-bold">What does the buyer want?</h2>
        <p className="mt-1 text-sm text-ink-2">The system picks the machines for you: closest spec first, then oldest stock.</p>
      </div>

      <div className="space-y-4 px-5 py-5">
        <Field label="Buyer">
          <Input list="buyers" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Company name" />
          <datalist id="buyers">
            {buyers.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <RequirementFields need={need} onChange={setNeed} className="sm:grid-cols-2" />
        <Field label="Price per machine (₹)">
          <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value === "" ? "" : +e.target.value)} />
        </Field>
      </div>

      <div className="mx-5 rounded-2xl border border-line">
        <div className={cn("flex items-start gap-3 rounded-t-2xl p-4", shortBy ? "bg-st-checking-bg" : "bg-st-ready-bg")}>
          {shortBy ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-st-checking" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-st-ready" />}
          <div>
            <p className={cn("font-semibold", shortBy ? "text-st-checking" : "text-st-ready")}>
              {shortBy
                ? `Only ${count(available)} machines fit — you can book ${count(picked.length)} now`
                : `${count(available)} machines fit. Booking the best ${count(picked.length)}.`}
            </p>
            {shortBy > 0 && <p className="text-[13px] text-ink-2">Lower the grade or spec to fill all {need.qty}, or book a part order.</p>}
          </div>
        </div>
        <ul className="divide-y divide-line-soft px-4 text-sm">
          {modelBreakdown(picked)
            .slice(0, 6)
            .map(([name, n]) => (
              <li key={name} className="flex justify-between py-2">
                <span className="text-ink-2">{name}</span>
                <span className="font-semibold tabular-nums">{n}</span>
              </li>
            ))}
        </ul>
        <div className="grid grid-cols-3 gap-2 border-t border-line p-4 text-sm">
          <div>
            <p className="text-ink-3">Order value</p>
            <p className="font-display text-lg font-bold">{rupeesShort(value)}</p>
          </div>
          <div>
            <p className="text-ink-3">Our cost</p>
            <p className="font-display text-lg font-bold">{rupeesShort(cost)}</p>
          </div>
          <div>
            <p className="text-ink-3">Profit</p>
            <p className={cn("font-display text-lg font-bold", value - cost >= 0 ? "text-st-ready" : "text-st-scrap")}>{rupeesShort(value - cost)}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
        <Button
          size="lg"
          className="w-full"
          disabled={!canBook || busy}
          onClick={async () => {
            setBusy(true);
            const res = await createOrder(buyer.trim(), { ...need, qty: picked.length }, unitPrice || 0);
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success(`${res.orderCode} booked — ${picked.length} machines set aside for ${buyer.trim()}`, {
              description: "They can't be sold at the shop now. Download the serial list for packing.",
            });
            onDone();
          }}
        >
          <Truck /> Book {count(picked.length)} machines for {buyer.trim() || "this buyer"}
        </Button>
      </div>
    </div>
  );
}
