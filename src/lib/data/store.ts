"use client";

import { create } from "zustand";
import type {
  Activity,
  Batch,
  BigOrder,
  Grade,
  Location,
  Machine,
  Requirement,
  ReturnRecord,
  Role,
  ShopSale,
  Staff,
  SupplierType,
} from "./types";
import * as api from "@/server/actions";
import type { Patch } from "@/server/repo";
import type { CheckInput, NewMachine } from "@/server/service";

/**
 * Browser-side cache of what the server sent. Screens read from here.
 * Every change goes to a server action; the server answers with a patch that is merged in.
 */

export type NewMachineInput = NewMachine & { cost: number };

type Status = "loading" | "signed-out" | "ready" | "offline";
type Fail = { ok: false; error: string };

type State = {
  status: Status;
  user: Staff | null;
  engine: "postgres" | "embedded" | null;
  machines: Machine[];
  batches: Batch[];
  orders: BigOrder[];
  sales: ShopSale[];
  returns: ReturnRecord[];
  activity: Activity[];
  staff: Staff[];
  lastSync: number;
};

type Actions = {
  load: (quiet?: boolean) => Promise<void>;
  apply: (p: Patch) => void;
  signOut: () => Promise<void>;
  addBatch: (i: { supplier: string; supplierType: SupplierType; totalCost: number; location: Location; items: NewMachineInput[] }) => Promise<{ ok: true; batchCode: string } | Fail>;
  checkMachine: (c: CheckInput) => Promise<{ ok: true } | Fail>;
  finishRepair: (id: string, part: string, cost: number, grade: Grade) => Promise<{ ok: true } | Fail>;
  moveMachines: (ids: string[], to: Location) => Promise<{ ok: true } | Fail>;
  setPrice: (id: string, price: number) => Promise<{ ok: true } | Fail>;
  createOrder: (buyer: string, need: Requirement, unitPrice: number) => Promise<{ ok: true; orderCode: string } | Fail>;
  dispatchOrder: (id: string) => Promise<{ ok: true } | Fail>;
  cancelOrder: (id: string) => Promise<{ ok: true } | Fail>;
  shopSell: (i: { machineId: string; customer: string; phone: string; price: number; warrantyMonths: number }) => Promise<{ ok: true; sale: ShopSale } | Fail>;
  recordReturn: (machineId: string, reason: string, refund: number) => Promise<{ ok: true; ret: ReturnRecord } | Fail>;
  saveStaff: (s: { id?: string; name: string; role: Role; pin?: string; active: boolean }) => Promise<{ ok: true } | Fail>;
  resetDemo: () => Promise<{ ok: true } | Fail>;
};

const EMPTY = { machines: [], batches: [], orders: [], sales: [], returns: [], activity: [], staff: [] };

function merge<T extends { id: string }>(list: T[], updates: T[] | undefined, prepend = false): T[] {
  if (!updates?.length) return list;
  const byId = new Map(updates.map((u) => [u.id, u]));
  const replaced = list.map((x) => byId.get(x.id) ?? x);
  const known = new Set(list.map((x) => x.id));
  const fresh = updates.filter((u) => !known.has(u.id));
  return prepend ? [...fresh, ...replaced] : [...replaced, ...fresh];
}

const network: Fail = { ok: false, error: "Can't reach the server. Check the internet connection and try again." };

export const useStore = create<State & Actions>()((set, get) => {
  /** call a server action, merge its patch, pass the result on */
  async function call<R extends { ok: boolean }>(fn: () => Promise<R>): Promise<R | Fail> {
    try {
      const res = await fn();
      if (res.ok) get().apply((res as unknown as { patch: Patch }).patch);
      else if ((res as unknown as Fail).error.startsWith("Your session has ended")) set({ status: "signed-out", user: null });
      return res;
    } catch {
      return network;
    }
  }

  return {
    status: "loading",
    user: null,
    engine: null,
    ...EMPTY,
    lastSync: 0,

    load: async (quiet) => {
      if (!quiet) set({ status: get().status === "ready" ? "ready" : "loading" });
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { user, data, engine } = await res.json();
        if (!user) return set({ status: "signed-out", user: null, ...EMPTY });
        set({ status: "ready", user, engine, ...EMPTY, ...data, lastSync: Date.now() });
      } catch {
        if (get().status !== "ready") set({ status: "offline" });
      }
    },

    apply: (p) => {
      if (p.replaceAll) return set({ ...EMPTY, ...p.replaceAll, lastSync: Date.now() });
      set((s) => ({
        machines: merge(s.machines, p.machines, true),
        batches: merge(s.batches, p.batches),
        orders: merge(s.orders, p.orders),
        sales: merge(s.sales, p.sales, true),
        returns: merge(s.returns, p.returns, true),
        activity: merge(s.activity, p.activity, true),
        staff: p.staff ?? s.staff,
      }));
    },

    signOut: async () => {
      await api.logout().catch(() => undefined);
      set({ status: "signed-out", user: null, ...EMPTY });
    },

    addBatch: (i) => call(() => api.addBatch(i)),
    checkMachine: (c) => call(() => api.checkMachine(c)),
    finishRepair: (id, part, cost, grade) => call(() => api.finishRepair({ id, part, cost, grade })),
    moveMachines: (ids, to) => call(() => api.moveMachines({ ids, to })),
    setPrice: (id, price) => call(() => api.setPrice({ id, price })),
    createOrder: (buyer, need, unitPrice) => call(() => api.createOrder({ buyer, need, unitPrice })),
    dispatchOrder: (id) => call(() => api.dispatchOrder(id)),
    cancelOrder: (id) => call(() => api.cancelOrder(id)),
    shopSell: async (i) => {
      const res = await call(() => api.shopSell(i));
      if (!res.ok) return res;
      return { ok: true, sale: (res as { patch: Patch }).patch.sales![0] };
    },
    recordReturn: async (machineId, reason, refund) => {
      const res = await call(() => api.recordReturn({ machineId, reason, refund }));
      if (!res.ok) return res;
      return { ok: true, ret: (res as { patch: Patch }).patch.returns![0] };
    },
    saveStaff: (s) => call(() => api.saveStaff(s)),
    resetDemo: () => call(() => api.resetDemoData()),
  };
});
