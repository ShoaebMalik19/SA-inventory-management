"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  IndianRupee,
  Settings,
  ArrowLeftRight,
  Undo2,
  Users,
  ArrowUpRight,
  ClipboardCheck,
  Clock,
  PackagePlus,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import { useStore } from "@/lib/data/store";
import {
  agingStock,
  moneyToCollect,
  salesInLast,
  specLabel,
  specMatrix,
  stageCounts,
  stockValue,
} from "@/lib/data/selectors";
import { STAGES, type Activity, type Stage } from "@/lib/data/types";
import { CountUp } from "@/components/count-up";
import { STAGE_STYLE } from "@/components/stage";
import { Button } from "@/components/ui/button";
import { count, rupees, rupeesShort, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const RAIL: Stage[] = ["checking", "repair", "ready", "booked"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const ACTIVITY_ICON: Record<Activity["kind"], typeof Truck> = {
  batch: PackagePlus,
  check: ClipboardCheck,
  order: Truck,
  dispatch: Truck,
  sale: Store,
  repair: Wrench,
  return: Undo2,
  move: ArrowLeftRight,
  staff: Users,
  payment: IndianRupee,
  settings: Settings,
};

export default function HomePage() {
  const machines = useStore((s) => s.machines);
  const orders = useStore((s) => s.orders);
  const activity = useStore((s) => s.activity);
  const invoices = useStore((s) => s.invoices);
  const payments = useStore((s) => s.payments);
  const dues = useMemo(() => moneyToCollect(invoices, payments), [invoices, payments]);

  const d = useMemo(() => {
    const counts = stageCounts(machines);
    const inStock = counts.checking + counts.repair + counts.ready + counts.booked;
    const value = stockValue(machines);
    const month = salesInLast(machines, 30);
    const aging = agingStock(machines, 60);
    const agingValue = aging.reduce((s, m) => s + m.cost + m.repairCost, 0);
    const oldestWaiting = machines
      .filter((m) => m.stage === "checking")
      .reduce<string | null>((min, m) => (!min || m.addedAt < min ? m.addedAt : min), null);
    const specs = specMatrix(machines).slice(0, 6);
    const openOrders = orders.filter((o) => o.status === "booked");
    const godown = machines.filter((m) => m.location === "Godown" && m.stage !== "sold" && m.stage !== "scrap").length;
    return { counts, inStock, value, month, aging, agingValue, oldestWaiting, specs, openOrders, godown };
  }, [machines, orders]);

  const maxSpec = Math.max(...d.specs.map((s) => s.total), 1);

  return (
    <div>
      {/* Hero: the one number the owner cares about */}
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[15px] font-medium text-ink-2">
            {greeting()}. Here is your stock today.
          </p>
          <h1 className="font-display mt-2 text-[44px] font-bold leading-[0.98] sm:text-[64px]">
            <span className="text-brand">
              <CountUp to={d.counts.ready} />
            </span>{" "}
            machines
            <br className="hidden sm:block" /> ready to sell
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
            {count(d.inStock)} machines in stock — {count(d.inStock - d.godown)} at the shop, {count(d.godown)} in the
            godown — bought for {rupeesShort(d.value.cost)}, worth {rupeesShort(d.value.asking)} at asking price.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="outline">
            <Link href="/add">
              <PackagePlus /> Add stock
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/orders">
              <Truck /> New big order
            </Link>
          </Button>
        </div>
      </section>

      {/* Stage rail: where every machine in stock is right now */}
      <section className="mt-9 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Where your stock is</h2>
          <Link href="/machines" className="text-sm font-semibold text-brand hover:underline">
            See all machines
          </Link>
        </div>
        <div className="mt-5 flex h-4 gap-1 overflow-hidden rounded-full">
          {RAIL.map((st, i) => (
            <motion.div
              key={st}
              className={cn("h-full rounded-full", STAGE_STYLE[st].bar)}
              initial={{ flexGrow: 0.0001 }}
              animate={{ flexGrow: Math.max(d.counts[st], 1) }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{ flexBasis: 0 }}
            />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {RAIL.map((st) => (
            <Link key={st} href={`/machines?stage=${st}`} className="group rounded-xl">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-2">
                <span className={cn("size-2.5 rounded-full", STAGE_STYLE[st].dot)} />
                {STAGES[st].label}
              </div>
              <p className="font-display mt-1 text-[30px] font-bold leading-none group-hover:text-brand">
                {count(d.counts[st])}
              </p>
              <p className="mt-1 text-[13px] text-ink-3">{STAGES[st].hint}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Money in the last 30 days */}
      <section className="mt-5 grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Sold in the last 30 days" value={rupeesShort(d.month.revenue)} note={`${count(d.month.units)} machines`} />
        <Figure
          label="Profit in the last 30 days"
          value={rupeesShort(d.month.profit)}
          note={`${Math.round((d.month.profit / Math.max(d.month.revenue, 1)) * 100)}% margin after repairs`}
          accent
        />
        <Link href="/money" className="group">
          <Figure
            label="Money to collect"
            value={rupeesShort(dues.total)}
            note={dues.overdue > 0 ? `${rupeesShort(dues.overdue)} overdue — see who owes` : "Nothing overdue"}
            danger={dues.overdue > 0}
          />
        </Link>
        <Figure
          label="Booked for big orders"
          value={`${count(d.counts.booked)} machines`}
          note={d.openOrders.length ? `${d.openOrders.length} order waiting to dispatch` : "No open orders"}
        />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        {/* Needs attention */}
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">Needs attention</h2>
          <ul className="mt-3 divide-y divide-line-soft">
            <Attention
              href="/check"
              icon={ClipboardCheck}
              tone="checking"
              title={`${count(d.counts.checking)} machines waiting to be checked`}
              note={d.oldestWaiting ? `Oldest arrived ${timeAgo(d.oldestWaiting)}` : "All caught up"}
            />
            <Attention
              href="/machines?stage=repair"
              icon={Wrench}
              tone="repair"
              title={`${count(d.counts.repair)} machines in repair`}
              note="Can't be sold until fixed"
            />
            <Attention
              href="/machines?stage=ready&old=1"
              icon={Clock}
              tone="scrap"
              title={`${count(d.aging.length)} ready machines older than 60 days`}
              note={`${rupees(d.agingValue)} of your money is sitting on the shelf`}
            />
            {dues.overdue > 0 && (
              <Attention
                href="/money"
                icon={IndianRupee}
                tone="scrap"
                title={`${rupees(dues.overdue)} overdue from buyers`}
                note={`${dues.rows.filter((r) => r.overdue > 0).map((r) => r.buyer).join(", ")} — past their payment date`}
              />
            )}
            {d.openOrders.map((o) => (
              <Attention
                key={o.id}
                href="/orders"
                icon={Truck}
                tone="booked"
                title={`Big order ${o.code} is booked, not dispatched`}
                note={`${o.machineIds.length} machines for ${o.buyer}`}
              />
            ))}
          </ul>
        </section>

        {/* Top specs */}
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Most ready stock, by spec</h2>
            <Link href="/stock" className="text-sm font-semibold text-brand hover:underline">
              Ready stock
            </Link>
          </div>
          <ul className="mt-4 space-y-3.5">
            {d.specs.map((s) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="truncate font-semibold">
                    {s.type === "Desktop" && <span className="mr-1 text-ink-3">Desktop</span>}
                    {specLabel(s)}
                  </span>
                  <span className="shrink-0 font-display text-[17px] font-bold">{s.total}</span>
                </div>
                <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-mist">
                  <div className="bg-brand" style={{ width: `${(s.A / maxSpec) * 100}%` }} title={`Grade A: ${s.A}`} />
                  <div className="bg-[#6fae9c]" style={{ width: `${(s.B / maxSpec) * 100}%` }} title={`Grade B: ${s.B}`} />
                  <div className="bg-[#b9d3cb]" style={{ width: `${(s.C / maxSpec) * 100}%` }} title={`Grade C: ${s.C}`} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-4 text-[12.5px] text-ink-3">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand" />Grade A</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#6fae9c]" />Grade B</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#b9d3cb]" />Grade C</span>
          </div>
        </section>
      </div>

      {/* Activity */}
      <section className="mt-5 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">What happened recently</h2>
        <ul className="mt-3 divide-y divide-line-soft">
          {activity.slice(0, 8).map((a) => {
            const Icon = ACTIVITY_ICON[a.kind];
            return (
              <li key={a.id} className="flex items-center gap-3.5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mist text-ink-2">
                  <Icon className="size-4" />
                </span>
                <p className="min-w-0 flex-1 text-[14.5px]">
                  {a.text}
                  {a.by && <span className="text-ink-3"> · {a.by}</span>}
                </p>
                <span className="shrink-0 text-[13px] text-ink-3">{timeAgo(a.at)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Figure({ label, value, note, accent, danger }: { label: string; value: string; note: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="h-full border-b border-line-soft p-5 sm:border-r sm:p-6 lg:border-b-0">
      <p className="text-[13.5px] font-semibold text-ink-2">{label}</p>
      <p className={cn("font-display mt-2 text-[32px] font-bold leading-none", accent && "text-st-ready", danger && "text-st-scrap")}>{value}</p>
      <p className="mt-2 text-[13px] text-ink-3">{note}</p>
    </div>
  );
}

function Attention({
  href,
  icon: Icon,
  tone,
  title,
  note,
}: {
  href: string;
  icon: typeof Truck;
  tone: Stage;
  title: string;
  note: string;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3.5 py-3.5">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", STAGE_STYLE[tone].bg, STAGE_STYLE[tone].text)}>
          {tone === "scrap" ? <AlertTriangle className="size-[18px]" /> : <Icon className="size-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug">{title}</span>
          <span className="block text-[13px] text-ink-3">{note}</span>
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-ink-3 transition group-hover:text-brand" />
      </Link>
    </li>
  );
}
