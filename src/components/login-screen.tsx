"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Delete, Loader2 } from "lucide-react";
import { login } from "@/server/actions";
import { useStore } from "@/lib/data/store";
import { ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type StaffCard = { id: string; name: string; role: Role };

const INITIALS = (n: string) =>
  n
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function LoginScreen() {
  const load = useStore((s) => s.load);
  const [staff, setStaff] = useState<StaffCard[] | null>(null);
  const [who, setWho] = useState<StaffCard | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // the digits typed so far, readable inside key handlers without waiting for a render
  const pinRef = useRef("");

  useEffect(() => {
    fetch("/api/staff", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStaff)
      .catch(() => setError("Can't reach the server."));
  }, []);

  const submit = useCallback(
    async (full: string) => {
      if (!who) return;
      setBusy(true);
      setError("");
      const res = await login(who.id, full).catch(() => ({ ok: false as const, error: "Can't reach the server." }));
      if (res.ok) await load();
      else {
        setError(res.error);
        pinRef.current = "";
        setPin("");
        setBusy(false);
      }
    },
    [who, load],
  );

  const setPinBoth = useCallback((v: string) => {
    pinRef.current = v;
    setPin(v);
  }, []);

  const press = useCallback(
    (d: string) => {
      if (busy || pinRef.current.length >= 4) return;
      setError("");
      const next = pinRef.current + d;
      setPinBoth(next);
      if (next.length === 4) void submit(next);
    },
    [busy, submit, setPinBoth],
  );
  const back = useCallback(() => setPinBoth(pinRef.current.slice(0, -1)), [setPinBoth]);

  useEffect(() => {
    if (!who) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") back();
      if (e.key === "Escape") setWho(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [who, press, back]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="relative hidden overflow-hidden bg-brand-deep p-12 text-white lg:flex lg:flex-col">
        <span className="grid h-14 w-16 place-items-center rounded-[12px] bg-tag font-display text-2xl font-extrabold text-ink">S.A</span>
        <h1 className="font-display mt-auto max-w-md text-[52px] font-bold leading-[1.02]">Every machine, from the godown to the customer.</h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/65">
          S.A Computers, RT Nagar. Stock, checking, big orders and shop sales in one place.
        </p>
        <div className="barcode absolute right-12 top-12 h-20 w-64 opacity-[.08] invert" aria-hidden />
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        {!who ? (
          <div className="mx-auto w-full max-w-md">
            <span className="grid h-12 w-14 place-items-center rounded-[10px] bg-tag font-display text-xl font-extrabold text-ink lg:hidden">S.A</span>
            <h2 className="font-display mt-6 text-[32px] font-bold leading-tight lg:mt-0">Who is working?</h2>
            <p className="mt-1 text-ink-2">Tap your name, then enter your 4-digit PIN.</p>
            <ul className="mt-6 space-y-2">
              {!staff && !error && (
                <li className="flex items-center gap-2 text-ink-3">
                  <Loader2 className="size-4 animate-spin" /> Loading staff…
                </li>
              )}
              {staff?.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setWho(s);
                      pinRef.current = "";
                      setPin("");
                      setError("");
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand"
                  >
                    <span className="grid size-12 place-items-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand-deep">
                      {INITIALS(s.name)}
                    </span>
                    <span>
                      <span className="block text-[16px] font-semibold">{s.name}</span>
                      <span className="block text-sm text-ink-3">{ROLE_LABEL[s.role]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="mt-4 text-sm text-st-scrap">{error}</p>}
            <p className="mt-8 rounded-xl bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-3">
              Sample PINs for the demo: owner 1111 · manager 2222 · technician 3333 · counter 4444. The owner can change them on the Staff page.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[340px] text-center">
            <button onClick={() => setWho(null)} className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
              <ArrowLeft className="size-4" /> Not you?
            </button>
            <span className="mx-auto mt-6 grid size-16 place-items-center rounded-full bg-brand-soft font-display text-2xl font-bold text-brand-deep">
              {INITIALS(who.name)}
            </span>
            <h2 className="font-display mt-3 text-2xl font-bold">{who.name}</h2>
            <p className="text-sm text-ink-3">Enter your PIN</p>
            <div className={cn("mt-6 flex justify-center gap-3", error && "animate-[shake_.35s]")}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn("size-4 rounded-full border-2 transition", i < pin.length ? "border-brand bg-brand" : "border-line")}
                />
              ))}
            </div>
            <p className={cn("mt-3 h-5 text-sm", error ? "text-st-scrap" : "text-ink-3")}>
              {busy ? "Checking…" : error}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Key key={d} onClick={() => press(d)}>
                  {d}
                </Key>
              ))}
              <span />
              <Key onClick={() => press("0")}>0</Key>
              <Key onClick={back} aria-label="Delete">
                <Delete className="size-5" />
              </Key>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Key(props: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className="grid h-16 place-items-center rounded-2xl bg-surface font-display text-2xl font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-line)] transition active:translate-y-px active:bg-line-soft"
    />
  );
}
