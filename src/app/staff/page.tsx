"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/data/store";
import type { Role, Staff } from "@/lib/data/types";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ROLES: Role[] = ["owner", "manager", "technician", "counter"];

export default function StaffPage() {
  const staff = useStore((s) => s.staff);
  const me = useStore((s) => s.user);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Staff"
        sub="Who can log in, and what each person can do. Everyone logs in with their name and a 4-digit PIN."
        actions={
          <Button size="lg" onClick={() => setEditing("new")}>
            <Plus /> Add staff
          </Button>
        }
      />

      <ul className="divide-y divide-line-soft overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-5 py-4">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full font-display text-lg font-bold",
                s.active ? "bg-brand-soft text-brand-deep" : "bg-line text-ink-3",
              )}
            >
              {s.name.replace(/\(.*\)/, "").trim()[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15.5px] font-semibold", !s.active && "text-ink-3 line-through")}>
                {s.name} {s.id === me?.id && <span className="font-normal text-ink-3">(you)</span>}
              </p>
              <p className="text-[13px] text-ink-3">
                {ROLE_LABEL[s.role]} — {ROLE_HINT[s.role]}
              </p>
            </div>
            {!s.active && <span className="rounded-full bg-st-sold-bg px-2.5 py-1 text-[12.5px] font-semibold text-st-sold">Can&apos;t log in</span>}
            <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Staff member" side="center">
        {editing && <StaffForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function StaffForm({ initial, onDone }: { initial: Staff | null; onDone: () => void }) {
  const saveStaff = useStore((s) => s.saveStaff);
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "counter");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4 p-5 pt-14">
      <h2 className="font-display text-2xl font-bold">{initial ? `Edit ${initial.name}` : "Add a staff member"}</h2>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arif" />
      </Field>
      <div>
        <p className="text-sm font-semibold">What do they do?</p>
        <div className="mt-2 grid gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={cn("rounded-xl border-2 px-4 py-3 text-left", role === r ? "border-brand bg-brand-soft" : "border-line")}
            >
              <span className="block font-semibold">{ROLE_LABEL[r]}</span>
              <span className="block text-[13px] text-ink-2">{ROLE_HINT[r]}</span>
            </button>
          ))}
        </div>
      </div>
      <Field label={initial ? "New PIN (leave empty to keep the old one)" : "PIN"} hint="4 digits">
        <Input
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="font-mono tracking-[0.4em]"
        />
      </Field>
      {initial && (
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
          Can log in
        </label>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={busy || !name.trim() || (!initial && pin.length !== 4) || (pin.length > 0 && pin.length !== 4)}
        onClick={async () => {
          setBusy(true);
          const res = await saveStaff({ id: initial?.id, name, role, pin: pin || undefined, active });
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          toast.success(initial ? "Saved" : `${name.trim()} can now log in`);
          onDone();
        }}
      >
        {initial ? "Save changes" : "Add staff member"}
      </Button>
    </div>
  );
}
