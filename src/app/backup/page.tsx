"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { CloudUpload, DatabaseBackup, Download, FileSpreadsheet, History, ShieldCheck } from "lucide-react";
import * as api from "@/server/actions";
import { useStore } from "@/lib/data/store";
import type { BackupInfo } from "@/lib/data/types";
import { STAGES } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { count, dateTime, hoursSince, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<BackupInfo["kind"], string> = { auto: "Nightly", manual: "Made by hand", "before-restore": "Before a restore" };
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export default function BackupPage() {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<{ id?: string; file?: File; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const r = await api.listBackups().catch(() => null);
    if (r?.ok) setList(r.items);
    else toast.error(r?.error ?? "Can't reach the server.");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the list once when the page opens
    reload();
  }, [reload]);

  const latest = list?.[0];
  const fresh = latest && hoursSince(latest.at) < 30;

  return (
    <div>
      <PageHeader title="Backups" sub="A full copy of everything is saved every night by itself. You can also save one now, download it, or go back to an older copy." />

      <section className={cn("flex flex-col gap-4 rounded-[var(--radius-panel)] border-2 p-5 sm:flex-row sm:items-center sm:p-6", fresh ? "border-st-ready/40 bg-st-ready-bg/40" : "border-st-checking/40 bg-st-checking-bg/40")}>
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", fresh ? "bg-st-ready text-white" : "bg-st-checking text-white")}>
          <ShieldCheck className="size-6" />
        </span>
        <div className="flex-1">
          <p className="font-display text-xl font-bold">{list === null ? "Checking…" : latest ? `Last backup ${timeAgo(latest.at)}` : "No backup yet"}</p>
          <p className="text-sm text-ink-2">
            {latest ? `${dateTime(latest.at)} · ${count(latest.rows)} records · ${kb(latest.size)}` : "Make the first one now. After that one is made every night at about 3 AM."}
          </p>
        </div>
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api.backupNow().catch(() => null);
            setBusy(false);
            if (!r?.ok) return toast.error(r?.error ?? "Can't reach the server.");
            toast.success("Backup saved", { description: `${count(r.info.rows)} records` });
            reload();
          }}
        >
          <DatabaseBackup /> {busy ? "Saving…" : "Back up now"}
        </Button>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ExcelExport />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5 text-left transition hover:border-brand"
        >
          <CloudUpload className="mt-0.5 size-6 shrink-0 text-brand" />
          <span>
            <span className="block font-semibold">Restore from a file</span>
            <span className="block text-sm text-ink-2">Pick a backup file you downloaded earlier (it ends in .json.gz).</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".gz,.json,application/gzip,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setRestoring({ file: f, label: f.name });
            e.target.value = "";
          }}
        />
      </div>

      <h2 className="mt-8 font-display text-lg font-bold">Saved copies</h2>
      <p className="text-sm text-ink-2">The last 30 nightly copies and 15 hand-made ones are kept.</p>
      <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        {(list ?? []).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <History className="size-5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{dateTime(b.at)}</p>
              <p className="text-[13px] text-ink-3">
                {KIND[b.kind]}
                {b.by && b.kind !== "auto" ? ` by ${b.by}` : ""} · {count(b.rows)} records · {kb(b.size)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/backup/${b.id}`} download>
                  <Download /> Download
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRestoring({ id: b.id, label: dateTime(b.at) })}>
                Go back to this
              </Button>
            </div>
          </li>
        ))}
        {list?.length === 0 && <li className="px-4 py-8 text-center text-ink-3">No copies yet.</li>}
      </ul>

      <Restore target={restoring} onClose={() => setRestoring(null)} onDone={reload} />
    </div>
  );
}

function Restore({ target, onClose, onDone }: { target: { id?: string; file?: File; label: string } | null; onClose: () => void; onDone: () => void }) {
  const restoreBackup = useStore((s) => s.restoreBackup);
  const load = useStore((s) => s.load);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    let ok = false;
    let error = "";
    if (target.id) {
      const r = await restoreBackup(target.id, confirm);
      ok = r.ok;
      if (!r.ok) error = r.error;
    } else if (target.file) {
      const r = await fetch("/api/backup/restore", { method: "POST", headers: { "x-confirm": confirm.trim().toUpperCase() }, body: await target.file.arrayBuffer() })
        .then((x) => x.json())
        .catch(() => ({ ok: false, error: "Can't reach the server." }));
      ok = r.ok;
      error = r.error;
      if (ok) await load();
    }
    setBusy(false);
    if (!ok) return toast.error(error || "The restore didn't work. Nothing was changed.");
    toast.success("Restored", { description: "Everything is back as it was in that copy." });
    setConfirm("");
    onClose();
    onDone();
  };
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()} title="Go back to a backup" side="center">
      {target && (
        <div className="p-5 pt-14">
          <p className="font-display text-xl font-bold">Go back to {target.label}?</p>
          <p className="mt-1 text-sm text-ink-2">
            <b>Everything</b> — stock, sales, bills, payments, staff — becomes exactly as it was in that copy. Work done after it will be gone from the
            app. A copy of how things are right now is saved first, so you can undo this too.
          </p>
          <Field label="Type RESTORE to confirm" className="mt-4">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoCorrect="off" placeholder="RESTORE" />
          </Field>
          <div className="mt-5 grid gap-2">
            <Button size="lg" variant="danger" disabled={confirm.trim().toUpperCase() !== "RESTORE" || busy} onClick={go}>
              {busy ? "Restoring…" : "Go back to this copy"}
            </Button>
            <Button size="lg" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ExcelExport() {
  const s = useStore();
  const run = () => {
    const wb = XLSX.utils.book_new();
    const batch = new Map(s.batches.map((b) => [b.id, b]));
    const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Nothing yet" }]), name);
    add(
      "Machines",
      s.machines.map((m) => ({
        Serial: m.serial,
        Type: m.type,
        Brand: m.brand,
        Model: m.model,
        Processor: `${m.cpu} ${m.gen}th gen`,
        "RAM GB": m.ram,
        "Storage GB": m.storage,
        "Storage type": m.storageType,
        Grade: m.grade ?? "",
        Status: STAGES[m.stage].label,
        Where: m.location,
        "Bought for": m.cost,
        "Repairs": m.repairCost,
        "Asking price": m.price || "",
        "Sold for": m.soldPrice ?? "",
        "Sold to": m.soldTo ?? "",
        Batch: batch.get(m.batchId)?.code ?? "",
        Supplier: batch.get(m.batchId)?.supplier ?? "",
        "Battery %": m.battery ?? "",
        "Came in": m.addedAt.slice(0, 10),
      })),
    );
    add("Batches", s.batches.map((b) => ({ Batch: b.code, Supplier: b.supplier, Kind: b.supplierType, Date: b.date.slice(0, 10), Machines: b.count, Cost: b.totalCost, "Bill no": b.billNo ?? "", "Pay by": b.dueDate?.slice(0, 10) ?? "" })));
    add("Shop sales", s.sales.map((x) => ({ Sale: x.code, Date: x.at.slice(0, 10), Customer: x.customer, Phone: x.phone, Price: x.price, "Warranty months": x.warrantyMonths, By: x.by ?? "" })));
    add("Big orders", s.orders.map((o) => ({ Order: o.code, Buyer: o.buyer, Status: o.status, Machines: o.machineIds.length, "Price each": o.unitPrice, Booked: o.createdAt.slice(0, 10), Dispatched: o.dispatchedAt?.slice(0, 10) ?? "" })));
    add(
      "Invoices",
      s.invoices.map((i) => ({ Number: i.number, Date: i.date.slice(0, 10), Buyer: i.buyerName, GSTIN: i.buyerGstin ?? "", Taxable: i.taxable, CGST: i.cgst, SGST: i.sgst, IGST: i.igst, Total: i.total, Cancelled: i.creditNote ? `Yes — ${i.creditNote}` : "" })),
    );
    add("Payments in", s.payments.map((p) => ({ Invoice: s.invoices.find((i) => i.id === p.invoiceId)?.number ?? "", Date: p.at.slice(0, 10), Amount: p.amount, Mode: p.mode, Reference: p.reference ?? "", By: p.by ?? "" })));
    add("Supplier payments", s.supplierPayments.map((p) => ({ Supplier: p.supplier, Batch: batch.get(p.batchId)?.code ?? "", Date: p.at.slice(0, 10), Amount: p.amount, Mode: p.mode, Reference: p.reference ?? "" })));
    add("Returns", s.returns.map((r) => ({ Return: r.code, Date: r.at.slice(0, 10), Customer: r.customer, From: r.refCode, Reason: r.reason, Refund: r.refund })));
    XLSX.writeFile(wb, `S.A Computers — everything ${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return (
    <button onClick={run} className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5 text-left transition hover:border-brand">
      <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-brand" />
      <span>
        <span className="block font-semibold">Download everything as Excel</span>
        <span className="block text-sm text-ink-2">Every machine, sale, bill and payment in one workbook — to read or give to the accountant.</span>
      </span>
    </button>
  );
}
