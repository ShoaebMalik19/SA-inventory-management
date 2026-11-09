"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  BatteryMedium,
  ClipboardCheck,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  Pencil,
  Printer,
  ShieldCheck,
  Store,
  Undo2,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useStore } from "@/lib/data/store";
import { can } from "@/lib/roles";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { GradeBadge, GRADE_MEANING, StagePill } from "@/components/stage";
import { Barcode } from "@/components/barcode";
import { daysSince, dateTime, ordinal, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HistoryEvent, Machine } from "@/lib/data/types";

const EVENT_DOT: Record<HistoryEvent["kind"], string> = {
  added: "bg-ink-3",
  checked: "bg-st-ready",
  repair: "bg-st-repair",
  upgrade: "bg-brand",
  moved: "bg-ink-3",
  booked: "bg-tag",
  released: "bg-ink-3",
  sold: "bg-st-sold",
  returned: "bg-st-scrap",
};

export const RETURN_REASONS = ["Not working", "Battery problem", "Screen problem", "Keyboard problem", "Customer changed mind", "Wrong spec sent"];

export function MachineSheet() {
  const { machineId, closeMachine } = useUI();
  const m = useStore((s) => (machineId ? s.machines.find((x) => x.id === machineId) : undefined));
  return (
    <Sheet open={!!m} onOpenChange={(o) => !o && closeMachine()} title={m ? `${m.brand} ${m.model}` : "Machine"}>
      {m && <MachineDetail key={m.id} m={m} />}
    </Sheet>
  );
}

function MachineDetail({ m }: { m: Machine }) {
  const router = useRouter();
  const closeMachine = useUI((s) => s.closeMachine);
  const setLabelIds = useUI((s) => s.setLabelIds);
  const role = useStore((s) => s.user?.role);
  const batch = useStore((s) => s.batches.find((b) => b.id === m.batchId));
  const order = useStore((s) => (m.orderId ? s.orders.find((o) => o.id === m.orderId) : undefined));
  const moveMachines = useStore((s) => s.moveMachines);
  const setPrice = useStore((s) => s.setPrice);
  const money = can(role, "viewMoney");
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(() => useUI.getState().machineMode === "return" && m.stage === "sold");
  const [editPrice, setEditPrice] = useState<number | "" | null>(null);

  const move = async () => {
    const to = m.location === "Shop" ? "Godown" : "Shop";
    setBusy(true);
    const res = await moveMachines([m.id], to);
    setBusy(false);
    if (res.ok) toast.success(`Moved to the ${to.toLowerCase()}`);
    else toast.error(res.error);
  };

  return (
    <div className="pb-8">
      <p className="px-5 pt-6 text-[13.5px] font-semibold text-ink-3">Machine details</p>
      {/* Asset tag */}
      <div className="relative mx-5 mt-4 overflow-hidden rounded-2xl border-2 border-ink bg-tag-soft">
        <div className="flex items-start gap-4 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink-2">
              {m.condition} {m.type.toLowerCase()} · {m.brand}
            </p>
            <h2 className="font-display mt-0.5 text-[26px] font-bold leading-tight text-ink">{m.model}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StagePill stage={m.stage} />
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">{m.location}</span>
            </div>
          </div>
          <GradeBadge grade={m.grade} size="lg" />
        </div>
        <div className="flex items-center gap-4 border-t-2 border-dashed border-ink/25 bg-white/60 px-5 py-3">
          <Barcode value={m.serial} height={34} className="h-8 min-w-0 flex-1" />
          <div className="text-right">
            <p className="text-[11px] font-semibold text-ink-3">Serial number</p>
            <p className="font-mono text-[15px] font-medium tracking-wide text-ink">{m.serial}</p>
          </div>
        </div>
      </div>

      {m.grade && <p className="mx-5 mt-2 text-[13px] text-ink-3">Grade {m.grade}: {GRADE_MEANING[m.grade]}</p>}

      <dl className="mx-5 mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[
          { icon: Cpu, label: "Processor", value: `${m.cpu}, ${ordinal(m.gen)} gen` },
          { icon: MemoryStick, label: "RAM", value: `${m.ram} GB` },
          { icon: HardDrive, label: "Storage", value: `${m.storage} GB ${m.storageType}` },
          m.screen ? { icon: Monitor, label: "Screen", value: `${m.screen}"` } : { icon: Monitor, label: "Form", value: "Desktop (SFF)" },
          { icon: BatteryMedium, label: "Battery health", value: m.battery ? `${m.battery}%` : m.type === "Desktop" ? "No battery" : "Not checked" },
          { icon: ShieldCheck, label: "Data wiped", value: m.wiped ? "Yes, wiped" : "Not yet" },
        ].map((s) => (
          <div key={s.label} className="bg-surface p-3.5">
            <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <s.icon className="size-3.5" /> {s.label}
            </dt>
            <dd className={cn("mt-1 text-[15px] font-semibold", s.label === "Data wiped" && !m.wiped && "text-st-checking")}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {m.failedChecks && m.stage !== "sold" && (
        <p className="mx-5 mt-3 rounded-xl bg-st-repair-bg px-3.5 py-2.5 text-sm text-st-repair">
          <b>Failed checks:</b> {m.failedChecks.join(", ")}
        </p>
      )}

      <div className="mx-5 mt-5 rounded-2xl border border-line">
        {money && <Row label="Bought for" value={rupees(m.cost)} />}
        {money && <Row label="Repairs & upgrades" value={m.repairCost ? rupees(m.repairCost) : "None"} />}
        {m.stage === "sold" && m.soldPrice ? (
          <>
            <Row label={`Sold to ${m.soldTo}`} value={rupees(m.soldPrice)} strong />
            {money && (
              <Row
                label="Profit"
                value={rupees(m.soldPrice - m.cost - m.repairCost)}
                className={m.soldPrice - m.cost - m.repairCost >= 0 ? "text-st-ready" : "text-st-scrap"}
                strong
              />
            )}
          </>
        ) : m.price ? (
          editPrice !== null ? (
            <div className="flex items-end gap-2 p-3">
              <Field label="New asking price (₹)" className="flex-1">
                <Input type="number" autoFocus value={editPrice} onChange={(e) => setEditPrice(e.target.value === "" ? "" : +e.target.value)} />
              </Field>
              <Button
                className="h-11"
                disabled={!editPrice || busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await setPrice(m.id, editPrice || 0);
                  setBusy(false);
                  if (res.ok) {
                    toast.success("Price updated");
                    setEditPrice(null);
                  } else toast.error(res.error);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-ink-2">Asking price</span>
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-bold">{rupees(m.price)}</span>
                {can(role, "orders") && m.stage === "ready" && (
                  <button onClick={() => setEditPrice(m.price)} className="text-ink-3 hover:text-brand" aria-label="Change price">
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </span>
            </div>
          )
        ) : (
          <Row label="Asking price" value="Set after checking" />
        )}
      </div>

      <div className="mx-5 mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-mist p-3.5">
          <p className="text-[12.5px] text-ink-3">Came in batch</p>
          {money ? (
            <Link href="/batches" onClick={closeMachine} className="font-semibold text-brand underline-offset-2 hover:underline">
              {batch?.code}
            </Link>
          ) : (
            <p className="font-semibold">{batch?.code}</p>
          )}
          <p className="truncate text-[13px] text-ink-2">{batch?.supplier}</p>
        </div>
        <div className="rounded-2xl bg-mist p-3.5">
          <p className="text-[12.5px] text-ink-3">In stock for</p>
          <p className="font-semibold">{m.stage === "sold" ? "—" : `${daysSince(m.addedAt)} days`}</p>
          {order && <p className="truncate text-[13px] text-ink-2">Order {order.code}</p>}
        </div>
      </div>

      {returning ? (
        <ReturnForm m={m} onDone={() => setReturning(false)} />
      ) : (
        <div className="mx-5 mt-5 flex flex-wrap gap-2">
          {(m.stage === "checking" || m.stage === "repair") && can(role, "check") && (
            <Button asChild onClick={closeMachine}>
              <Link href={`/check?m=${m.id}`}>
                <ClipboardCheck /> {m.stage === "checking" ? "Check & grade now" : "Finish repair"}
              </Link>
            </Button>
          )}
          {m.stage === "ready" && can(role, "sell") && (
            <Button asChild onClick={closeMachine}>
              <Link href={`/sale?m=${m.id}`}>
                <Store /> Sell at the shop
              </Link>
            </Button>
          )}
          {m.stage === "sold" && can(role, "returns") && (
            <Button variant="outline" onClick={() => setReturning(true)}>
              <Undo2 /> Customer returned it
            </Button>
          )}
          {m.stage !== "sold" && m.stage !== "scrap" && (
            <Button variant="outline" onClick={move} disabled={busy}>
              <ArrowLeftRight /> Move to {m.location === "Shop" ? "godown" : "shop"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setLabelIds([m.id]);
              closeMachine();
              router.push("/labels");
            }}
          >
            <Printer /> Print label
          </Button>
        </div>
      )}

      <h3 className="mx-5 mt-7 font-display text-lg font-bold">History</h3>
      <ol className="mx-5 mt-3">
        {[...m.history].reverse().map((h, i, arr) => (
          <li key={i} className="relative flex gap-3 pb-4">
            {i < arr.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" />}
            <span className={cn("mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", EVENT_DOT[h.kind] ?? "bg-ink-3")} />
            <div>
              <p className="text-[14.5px] leading-snug text-ink">{h.text}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {dateTime(h.at)}
                {h.by && ` · ${h.by}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReturnForm({ m, onDone }: { m: Machine; onDone: () => void }) {
  const recordReturn = useStore((s) => s.recordReturn);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState<number | "">(m.soldPrice ?? "");
  const [busy, setBusy] = useState(false);
  const full = [reason, note.trim()].filter(Boolean).join(" — ");

  return (
    <div className="mx-5 mt-5 rounded-2xl border-2 border-st-scrap/40 bg-st-scrap-bg/40 p-4">
      <p className="font-display text-lg font-bold">Customer returned it</p>
      <p className="text-sm text-ink-2">The machine goes back to Check &amp; grade before it can be sold again.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {RETURN_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={cn("rounded-full border px-3 py-1.5 text-[13px] font-semibold", reason === r ? "border-st-scrap bg-st-scrap text-white" : "border-line bg-surface text-ink-2")}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_130px] gap-2">
        <Field label="Details (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shuts down at 20%" />
        </Field>
        <Field label="Refund ₹">
          <Input type="number" value={refund} onChange={(e) => setRefund(e.target.value === "" ? "" : +e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          disabled={!full || busy}
          onClick={async () => {
            setBusy(true);
            const res = await recordReturn(m.id, full, refund || 0);
            setBusy(false);
            if (res.ok) {
              toast.success(`Return ${res.ret.code} recorded`, { description: "The machine is waiting in Check & grade." });
              onDone();
            } else toast.error(res.error);
          }}
        >
          <Undo2 /> Record return
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft px-4 py-3 last:border-0">
      <span className="truncate text-sm text-ink-2">{label}</span>
      <span className={cn("text-[15px]", strong ? "font-bold" : "font-medium", className)}>{value}</span>
    </div>
  );
}
