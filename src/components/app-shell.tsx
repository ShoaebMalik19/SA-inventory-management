"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  HandCoins,
  ClipboardCheck,
  FileText,
  House,
  IndianRupee,
  Settings,
  Laptop,
  Layers,
  LayoutGrid,
  LogOut,
  Menu,
  PackagePlus,
  RotateCcw,
  Store,
  Truck,
  Undo2,
  Users,
  WifiOff,
  Tag,
  BarChart3,
  History,
  DatabaseBackup,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/data/store";
import { can, canOpen, HOME_FOR, ROLE_LABEL } from "@/lib/roles";
import { invoiceMoney } from "@/lib/data/selectors";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MachineSheet } from "@/components/machine-sheet";
import { LoginScreen } from "@/components/login-screen";

export const NAV = [
  { href: "/", label: "Home", short: "Home", icon: House },
  { href: "/machines", label: "All machines", short: "Machines", icon: Laptop },
  { href: "/stock", label: "Ready stock", short: "Ready", icon: LayoutGrid },
  { href: "/check", label: "Check & grade", short: "Check", icon: ClipboardCheck, badge: true },
  { href: "/add", label: "Add stock", short: "Add", icon: PackagePlus },
  { href: "/labels", label: "Print labels", short: "Labels", icon: Tag },
  { href: "/orders", label: "Big orders", short: "Orders", icon: Truck },
  { href: "/sale", label: "Shop sale", short: "Sell", icon: Store },
  { href: "/invoices", label: "Invoices", short: "Bills", icon: FileText },
  { href: "/money", label: "Money to collect", short: "Money", icon: IndianRupee, dues: true },
  { href: "/suppliers", label: "Suppliers", short: "Suppliers", icon: HandCoins },
  { href: "/reports", label: "Reports", short: "Reports", icon: BarChart3 },
  { href: "/returns", label: "Returns & warranty", short: "Returns", icon: Undo2 },
  { href: "/batches", label: "Batches", short: "Batches", icon: Layers },
  { href: "/history", label: "History", short: "History", icon: History },
  { href: "/staff", label: "Staff", short: "Staff", icon: Users },
  { href: "/backup", label: "Backups", short: "Backups", icon: DatabaseBackup },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

/** The four tabs at the bottom of a phone, picked for each job. Everything else is under More. */
const PHONE_TABS: Record<string, string[]> = {
  owner: ["/", "/stock", "/money", "/reports"],
  manager: ["/", "/stock", "/check", "/orders"],
  technician: ["/check", "/add", "/stock", "/machines"],
  counter: ["/sale", "/stock", "/invoices", "/returns"],
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative grid h-10 w-12 place-items-center rounded-[9px] bg-tag font-display text-[17px] font-extrabold text-ink shadow-[inset_0_-3px_0_rgba(0,0,0,.12)]">
        S.A
        <span className="absolute -right-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand-deep" />
      </span>
      <span className="leading-tight">
        <span className={cn("block font-display text-[17px] font-bold", light ? "text-white" : "text-ink")}>S.A Computers</span>
        <span className={cn("block text-[12.5px]", light ? "text-white/55" : "text-ink-3")}>RT Nagar, Bengaluru</span>
      </span>
    </Link>
  );
}

function WaitingBadge() {
  const n = useStore((s) => s.machines.reduce((c, m) => c + (m.stage === "checking" ? 1 : 0), 0));
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-tag px-2 py-0.5 text-[11.5px] font-bold text-ink">{n}</span>;
}

function OverdueBadge() {
  const n = useStore((s) => {
    let c = 0;
    for (const inv of s.invoices) if (invoiceMoney(inv, s.payments).status === "overdue") c++;
    return c;
  });
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-st-scrap px-2 py-0.5 text-[11.5px] font-bold text-white">{n}</span>;
}

function ResetButton({ className }: { className?: string }) {
  const resetDemo = useStore((s) => s.resetDemo);
  return (
    <button
      onClick={async () => {
        if (!confirm("Reset all stock, orders and sales back to the sample data? Staff and PINs are kept.")) return;
        const res = await resetDemo();
        if (res.ok) toast.success("Sample data restored");
        else toast.error(res.error);
      }}
      className={cn("flex items-center gap-2 text-[13px] transition", className)}
    >
      <RotateCcw className="size-3.5" /> Reset sample data
    </button>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-12 w-14 animate-pulse place-items-center rounded-[10px] bg-tag font-display text-lg font-extrabold text-ink">S.A</span>
        <span className="text-sm text-ink-3">{text}</span>
      </div>
    </div>
  );
}

function UserChip({ light }: { light?: boolean }) {
  const user = useStore((s) => s.user)!;
  const signOut = useStore((s) => s.signOut);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl p-2", light ? "bg-white/[.06]" : "bg-mist")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold", light ? "bg-white/15 text-white" : "bg-brand-soft text-brand-deep")}>
        {user.name.replace(/\(.*\)/, "").trim()[0]}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block truncate text-sm font-semibold", light ? "text-white" : "text-ink")}>{user.name}</span>
        <span className={cn("block text-[12px]", light ? "text-white/50" : "text-ink-3")}>{ROLE_LABEL[user.role]}</span>
      </span>
      <button
        onClick={signOut}
        aria-label="Log out"
        title="Log out"
        className={cn("grid size-8 place-items-center rounded-lg transition", light ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-ink-3 hover:bg-line")}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useStore((s) => s.status);
  const user = useStore((s) => s.user);
  const dataMode = useStore((s) => s.dataMode);
  const load = useStore((s) => s.load);
  const [moreOpen, setMoreOpen] = useState(false);

  // first load, then stay fresh: when the tab comes back into view and every 45 seconds
  useEffect(() => {
    void load();
    const refresh = () => document.visibilityState === "visible" && useStore.getState().status === "ready" && load(true);
    const t = setInterval(refresh, 45_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const allowed = user ? canOpen(user.role, pathname) : true;
  useEffect(() => {
    if (user && pathname === "/" && !allowed) router.replace(HOME_FOR[user.role]);
  }, [user, pathname, allowed, router]);

  if (status === "loading") return <Splash text="Opening your stock…" />;
  if (status === "signed-out") return <LoginScreen />;
  if (status === "offline")
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <WifiOff className="mx-auto size-8 text-ink-3" />
          <p className="font-display mt-3 text-xl font-bold">Can&apos;t reach the server</p>
          <p className="mt-1 text-ink-2">Check the internet connection, then try again.</p>
          <Button className="mt-5" onClick={() => load()}>
            Try again
          </Button>
        </div>
      </div>
    );
  if (!user) return <Splash text="Opening your stock…" />;

  const nav = NAV.filter((n) => canOpen(user.role, n.href));
  const mobile = (PHONE_TABS[user.role] ?? [])
    .map((h) => nav.find((n) => n.href === h))
    .filter((n): n is (typeof nav)[number] => !!n);

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-brand-deep px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo light />
        </div>
        <nav className="-mx-1 mt-8 flex flex-col gap-0.5 overflow-y-auto px-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition",
                  active ? "bg-white/[.09] text-white" : "text-white/60 hover:bg-white/[.05] hover:text-white",
                )}
              >
                {active && <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-tag" />}
                <item.icon className="size-[18px]" strokeWidth={active ? 2.3 : 1.9} />
                {item.label}
                {item.badge && <WaitingBadge />}
                {item.dues && <OverdueBadge />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3">
          {can(user.role, "reset") && dataMode === "sample" && <ResetButton className="px-3 text-white/45 hover:text-white" />}
          <UserChip light />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line-soft bg-mist/90 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
        {allowed ? (
          children
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-line bg-surface px-6 py-16 text-center">
            <p className="font-display text-xl font-bold">This page isn&apos;t part of your job</p>
            <p className="mt-1 text-ink-2">Ask the owner if you need access.</p>
            <Button asChild className="mt-5">
              <Link href={HOME_FOR[user.role]}>Go to my screen</Link>
            </Button>
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {mobile.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11.5px] font-semibold", active ? "text-brand" : "text-ink-3")}>
              <item.icon className="size-[21px]" strokeWidth={active ? 2.4 : 1.9} />
              {item.short}
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11.5px] font-semibold text-ink-3">
          <Menu className="size-[21px]" strokeWidth={1.9} />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="All sections" side="center">
        <div className="p-5 pt-14">
          <div className="grid grid-cols-2 gap-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3.5 text-[15px] font-semibold",
                  isActive(pathname, item.href) ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <UserChip />
          </div>
          {can(user.role, "reset") && dataMode === "sample" && <ResetButton className="mx-auto mt-3 py-2 text-ink-3" />}
        </div>
      </Sheet>

      <MachineSheet />
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
    </div>
  );
}
