"use client";

import { create } from "zustand";
import type {
  Activity,
  Batch,
  Buyer,
  BusinessSettings,
  Invoice,
  Payment,
  PaymentMode,
  BigOrder,
  Grade,
  Location,
  Machine,
  Requirement,
  ReturnRecord,
  Role,
  ShopSale,
  Staff,
  Supplier,
  SupplierPayment,
  SupplierType,
  DataMode,
} from "./types";
import * as api from "@/server/actions";
import type { Patch } from "@/server/repo";
import type { BuyerInput, CheckInput, ImportRow, NewMachine } from "@/server/service";
import type { SupplierInput } from "@/server/suppliers";

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
  settings: BusinessSettings | null;
  buyers: Buyer[];
  invoices: Invoice[];
  payments: Payment[];
  suppliers: Supplier[];
  supplierPayments: SupplierPayment[];
  dataMode: DataMode;
  lastSync: number;
};

type Actions = {
  load: (quiet?: boolean) => Promise<void>;
  apply: (p: Patch) => void;
  signOut: () => Promise<void>;
  addBatch: (i: {
    supplier: string;
    supplierType: SupplierType;
    totalCost: number;
    location: Location;
    items: NewMachineInput[];
    billNo?: string;
    payDays?: number;
    paidNow?: number;
    paidMode?: PaymentMode;
  }) => Promise<{ ok: true; batchCode: string } | Fail>;
  paySupplier: (i: { batchId: string; amount: number; mode: PaymentMode; reference?: string }) => Promise<{ ok: true } | Fail>;
  saveSupplier: (s: SupplierInput & { id?: string }) => Promise<{ ok: true } | Fail>;
  importStock: (i: { rows: ImportRow[]; alreadyPaid: boolean }) => Promise<{ ok: true; imported: number; batchCodes: string[] } | Fail>;
  startLive: (confirm: string) => Promise<{ ok: true } | Fail>;
  checkMachine: (c: CheckInput) => Promise<{ ok: true } | Fail>;
  finishRepair: (id: string, part: string, cost: number, grade: Grade) => Promise<{ ok: true } | Fail>;
  moveMachines: (ids: string[], to: Location) => Promise<{ ok: true } | Fail>;
  setPrice: (id: string, price: number) => Promise<{ ok: true } | Fail>;
  createOrder: (buyer: string, need: Requirement, unitPrice: number, buyerDetails?: BuyerInput) => Promise<{ ok: true; orderCode: string } | Fail>;
  dispatchOrder: (id: string) => Promise<{ ok: true; invoiceNumber: string } | Fail>;
  cancelOrder: (id: string) => Promise<{ ok: true } | Fail>;
  shopSell: (i: {
    machineId: string;
    customer: string;
    phone: string;
    price: number;
    warrantyMonths: number;
    paymentMode: PaymentMode;
    reference?: string;
  }) => Promise<{ ok: true; sale: ShopSale; invoiceId: string } | Fail>;
  recordPayment: (i: { invoiceId: string; amount: number; mode: PaymentMode; reference?: string }) => Promise<{ ok: true } | Fail>;
  saveBuyer: (b: BuyerInput & { id?: string }) => Promise<{ ok: true } | Fail>;
  saveSettings: (s: BusinessSettings) => Promise<{ ok: true } | Fail>;
  recordReturn: (machineId: string, reason: string, refund: number) => Promise<{ ok: true; ret: ReturnRecord } | Fail>;
  saveStaff: (s: { id?: string; name: string; role: Role; pin?: string; active: boolean }) => Promise<{ ok: true } | Fail>;
  resetDemo: () => Promise<{ ok: true } | Fail>;
};

const EMPTY = {
  machines: [],
  batches: [],
  orders: [],
  sales: [],
  returns: [],
  activity: [],
  staff: [],
  settings: null,
  buyers: [],
  invoices: [],
  payments: [],
  suppliers: [],
  supplierPayments: [],
  dataMode: "sample" as DataMode,
};

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
        settings: p.settings ?? s.settings,
        buyers: p.buyers ?? s.buyers,
        invoices: merge(s.invoices, p.invoices, true),
        payments: merge(s.payments, p.payments),
        suppliers: p.suppliers ?? s.suppliers,
        supplierPayments: merge(s.supplierPayments, p.supplierPayments),
        dataMode: p.dataMode ?? s.dataMode,
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
    createOrder: (buyer, need, unitPrice, buyerDetails) => call(() => api.createOrder({ buyer, need, unitPrice, buyerDetails })),
    dispatchOrder: (id) => call(() => api.dispatchOrder(id)),
    cancelOrder: (id) => call(() => api.cancelOrder(id)),
    shopSell: async (i) => {
      const res = await call(() => api.shopSell(i));
      if (!res.ok) return res;
      const r = res as { patch: Patch; invoiceId: string };
      return { ok: true, sale: r.patch.sales![0], invoiceId: r.invoiceId };
    },
    recordReturn: async (machineId, reason, refund) => {
      const res = await call(() => api.recordReturn({ machineId, reason, refund }));
      if (!res.ok) return res;
      return { ok: true, ret: (res as { patch: Patch }).patch.returns![0] };
    },
    saveStaff: (s) => call(() => api.saveStaff(s)),
    recordPayment: (i) => call(() => api.recordPayment(i)),
    saveBuyer: (b) => call(() => api.saveBuyer(b)),
    saveSettings: (s) => call(() => api.saveSettings(s)),
    resetDemo: () => call(() => api.resetDemoData()),
    paySupplier: (i) => call(() => api.paySupplier(i)),
    saveSupplier: (s) => call(() => api.saveSupplier(s)),
    importStock: (i) => call(() => api.importStock(i)),
    startLive: (confirm) => call(() => api.startLive({ confirm })),
  };
});
