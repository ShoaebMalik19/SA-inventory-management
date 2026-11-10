"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import * as api from "@/server/actions";
import { useStore } from "@/lib/data/store";
import type { Activity } from "@/lib/data/types";
import { PageHeader } from "@/components/page-header";
import { ACTIVITY_ICON, ACTIVITY_LABEL } from "@/components/activity-icon";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** Everything anyone did in the app, newest first, with who did it. Nothing here can be edited or deleted. */
export default function HistoryPage() {
  const staff = useStore((s) => s.staff);
  const recent = useStore((s) => s.activity);
  const [by, setBy] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Activity[] | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(
    async (before?: string) => {
      setBusy(true);
      const res = await api.loadHistory({ before, by: by || undefined, kind: kind || undefined, search: q || undefined }).catch(() => null);
      setBusy(false);
      if (!res || !res.ok) return setError(res?.error ?? "Can't reach the server.");
      setError("");
      setMore(res.items.length >= 100);
      setItems((old) => (before && old ? [...old, ...res.items] : res.items));
    },
    [by, kind, q],
  );

  // reload when filters change, or when someone does something new
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from the server when filters change
    fetchPage();
  }, [fetchPage, recent.length]);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const people = useMemo(() => {
    const names = new Set(staff.map((s) => s.name));
    recent.forEach((a) => a.by && names.add(a.by));
    return [...names].sort();
  }, [staff, recent]);

  const groups = useMemo(() => {
    const g: { day: string; list: Activity[] }[] = [];
    for (const a of items ?? []) {
      const day = dayLabel(a.at);
      if (g[g.length - 1]?.day !== day) g.push({ day, list: [] });
      g[g.length - 1].list.push(a);
    }
    return g;
  }, [items]);

  return (
    <div>
      <PageHeader title="History" sub="Everything done in the app, newest first, with who did it and when. Nobody can edit or delete this list." />

      <div className="grid gap-2 sm:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search: serial, customer, batch, bill…" className="pl-10" />
        </div>
        <Select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Who">
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What">
          <option value="">Everything</option>
          {Object.entries(ACTIVITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="mt-4 rounded-xl bg-st-repair-bg px-4 py-3 text-sm text-st-repair">{error}</p>}

      {items === null ? (
        <p className="mt-10 text-center text-ink-3">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-16 text-center text-ink-2">Nothing matches.</div>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="sticky top-[61px] z-10 -mx-1 bg-mist/95 px-1 py-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-3 backdrop-blur lg:top-0">{g.day}</h2>
              <ul className="mt-1 divide-y divide-line-soft overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
                {g.list.map((a) => {
                  const Icon = ACTIVITY_ICON[a.kind] ?? Search;
                  return (
                    <li key={a.id} className="flex gap-3 px-4 py-3.5">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", a.kind === "fix" ? "bg-st-checking-bg text-st-checking" : "bg-mist text-ink-2")}>
                        <Icon className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] leading-snug">{a.text}</p>
                        {a.detail && <p className="mt-1 rounded-lg bg-mist px-2.5 py-1.5 text-[13px] leading-snug text-ink-2">{a.detail}</p>}
                        <p className="mt-1 text-[12.5px] text-ink-3">
                          {time(a.at)} · <b className="font-semibold text-ink-2">{a.by ?? "System"}</b> · {ACTIVITY_LABEL[a.kind] ?? a.kind}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {more && (
            <div className="text-center">
              <Button variant="outline" size="lg" disabled={busy} onClick={() => fetchPage(items[items.length - 1]?.at)}>
                {busy ? "Loading…" : "Show older"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
