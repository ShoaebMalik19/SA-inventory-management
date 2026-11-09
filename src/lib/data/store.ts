"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Activity, Batch, BigOrder, Grade, Location, Machine, Requirement, ShopSale } from "./types";
import { askingPrice, buildSeed, type SeedData } from "./seed";
import { pickForRequirement } from "./selectors";

/**
 * The prototype's whole "backend". Every screen reads and writes through here.
 * For production, these actions become Supabase calls; the screens stay the same.
 */

export type NewMachineInput = Omit<
  Machine,
  "id" | "batchId" | "grade" | "stage" | "repairCost" | "price" | "wiped" | "addedAt" | "updatedAt" | "history" | "location" | "condition"
> & { condition?: Machine["condition"] };

export type CheckResult = {
  failed: string[];
  battery?: number;
  wiped: boolean;
  grade: Grade | null;
  outcome: "ready" | "repair" | "scrap";
  upgrade?: { ram?: number; storage?: number; cost: number };
  repair?: { part: string; cost: number };
};

type State = SeedData & {
  seededAt: string;
};

type Actions = {
  resetDemo: () => void;
  addBatch: (b: Omit<Batch, "id" | "code" | "count" | "date">, items: NewMachineInput[], location: Location) => Batch;
  checkMachine: (id: string, result: CheckResult) => void;
  finishRepair: (id: string, part: string, cost: number, grade: Grade) => void;
  moveMachine: (id: string, to: Location) => void;
  setPrice: (id: string, price: number) => void;
  createOrder: (buyer: string, need: Requirement, unitPrice: number) => BigOrder | null;
  dispatchOrder: (id: string) => void;
  cancelOrder: (id: string) => void;
  shopSell: (machineId: string, customer: string, phone: string, price: number, warrantyMonths: number) =>
    | { ok: true; sale: ShopSale }
    | { ok: false; reason: string };
};

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function logActivity(list: Activity[], text: string, kind: Activity["kind"]): Activity[] {
  return [{ id: uid("a"), at: now(), text, kind }, ...list].slice(0, 200);
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...buildSeed(),
      seededAt: now(),

      resetDemo: () => set({ ...buildSeed(), seededAt: now() }),

      addBatch: (input, items, location) => {
        const { batches, machines, activity } = get();
        const code = `B-${1101 + batches.length}`;
        const batch: Batch = {
          ...input,
          id: uid("b"),
          code,
          date: now(),
          count: items.length,
        };
        const at = now();
        const perUnit = items.length ? input.totalCost / items.length : 0;
        const fresh: Machine[] = items.map((it) => ({
          ...it,
          id: uid("m"),
          batchId: batch.id,
          condition: it.condition ?? "Used",
          grade: null,
          stage: "checking",
          location,
          cost: it.cost || Math.round(perUnit),
          repairCost: 0,
          price: 0,
          wiped: false,
          addedAt: at,
          updatedAt: at,
          history: [{ at, text: `Added with batch ${code} from ${input.supplier}`, kind: "added" }],
        }));
        set({
          batches: [...batches, batch],
          machines: [...fresh, ...machines],
          activity: logActivity(activity, `New batch ${code}: ${items.length} machines from ${input.supplier}`, "batch"),
        });
        return batch;
      },

      checkMachine: (id, res) => {
        const at = now();
        set((s) => ({
          machines: s.machines.map((m) => {
            if (m.id !== id) return m;
            const next: Machine = { ...m, history: [...m.history], updatedAt: at };
            if (res.upgrade) {
              const parts: string[] = [];
              if (res.upgrade.ram && res.upgrade.ram !== m.ram) {
                parts.push(`RAM ${m.ram} GB → ${res.upgrade.ram} GB`);
                next.ram = res.upgrade.ram;
              }
              if (res.upgrade.storage && res.upgrade.storage !== m.storage) {
                parts.push(`Storage ${m.storage} GB → ${res.upgrade.storage} GB SSD`);
                next.storage = res.upgrade.storage;
                next.storageType = "SSD";
              }
              if (parts.length) {
                next.repairCost += res.upgrade.cost;
                next.history.push({ at, text: `Upgraded: ${parts.join(", ")} (₹${res.upgrade.cost.toLocaleString("en-IN")})`, kind: "upgrade" });
              }
            }
            next.failedChecks = res.failed.length ? res.failed : undefined;
            next.battery = res.battery;
            next.wiped = res.wiped;
            next.grade = res.outcome === "ready" ? res.grade : null;
            next.stage = res.outcome;
            next.history.push({
              at,
              text:
                res.outcome === "ready"
                  ? `Checked: ${res.failed.length ? `minor issues (${res.failed.join(", ")})` : "all tests passed"} · Grade ${res.grade}${res.wiped ? " · Data wiped" : ""}`
                  : res.outcome === "repair"
                    ? `Checked: failed ${res.failed.join(", ")} — sent to repair`
                    : `Checked: failed ${res.failed.join(", ") || "multiple tests"} — marked as scrap`,
              kind: "checked",
            });
            next.price = next.grade ? askingPrice(next) : 0;
            return next;
          }),
          activity: logActivity(
            s.activity,
            (() => {
              const m = s.machines.find((x) => x.id === id)!;
              return res.outcome === "ready"
                ? `${m.brand} ${m.model} checked — Grade ${res.grade}, ready to sell`
                : res.outcome === "repair"
                  ? `${m.brand} ${m.model} sent to repair`
                  : `${m.brand} ${m.model} marked as scrap`;
            })(),
            "check",
          ),
        }));
      },

      finishRepair: (id, part, cost, grade) => {
        const at = now();
        set((s) => ({
          machines: s.machines.map((m) => {
            if (m.id !== id) return m;
            const next: Machine = {
              ...m,
              repairCost: m.repairCost + cost,
              grade,
              stage: "ready",
              wiped: true,
              failedChecks: undefined,
              updatedAt: at,
              history: [
                ...m.history,
                { at, text: `Repaired: ${part} (₹${cost.toLocaleString("en-IN")}) · Grade ${grade} · Ready to sell`, kind: "repair" },
              ],
            };
            next.price = askingPrice(next);
            return next;
          }),
          activity: logActivity(s.activity, `Repair finished: ${part}`, "repair"),
        }));
      },

      moveMachine: (id, to) => {
        const at = now();
        set((s) => ({
          machines: s.machines.map((m) =>
            m.id === id && m.location !== to
              ? { ...m, location: to, updatedAt: at, history: [...m.history, { at, text: `Moved from ${m.location} to ${to}`, kind: "moved" }] }
              : m,
          ),
        }));
      },

      setPrice: (id, price) =>
        set((s) => ({ machines: s.machines.map((m) => (m.id === id ? { ...m, price } : m)) })),

      createOrder: (buyer, need, unitPrice) => {
        const { machines, orders, activity } = get();
        const { picked } = pickForRequirement(machines, need);
        if (!picked.length) return null;
        const at = now();
        const order: BigOrder = {
          id: uid("o"),
          code: `BO-${1040 + orders.length}`,
          buyer,
          createdAt: at,
          status: "booked",
          need,
          unitPrice,
          machineIds: picked.map((m) => m.id),
        };
        const ids = new Set(order.machineIds);
        set({
          orders: [order, ...orders],
          machines: machines.map((m) =>
            ids.has(m.id)
              ? {
                  ...m,
                  stage: "booked",
                  orderId: order.id,
                  updatedAt: at,
                  history: [...m.history, { at, text: `Booked for big order ${order.code} (${buyer})`, kind: "booked" }],
                }
              : m,
          ),
          activity: logActivity(activity, `Big order ${order.code} booked: ${picked.length} machines for ${buyer}`, "order"),
        });
        return order;
      },

      dispatchOrder: (id) => {
        const at = now();
        const { orders, machines, activity } = get();
        const order = orders.find((o) => o.id === id);
        if (!order || order.status !== "booked") return;
        const ids = new Set(order.machineIds);
        set({
          orders: orders.map((o) => (o.id === id ? { ...o, status: "dispatched", dispatchedAt: at } : o)),
          machines: machines.map((m) =>
            ids.has(m.id)
              ? {
                  ...m,
                  stage: "sold",
                  soldPrice: order.unitPrice,
                  soldTo: order.buyer,
                  updatedAt: at,
                  history: [...m.history, { at, text: `Dispatched to ${order.buyer} with ${order.code}`, kind: "sold" }],
                }
              : m,
          ),
          activity: logActivity(activity, `Big order ${order.code} dispatched to ${order.buyer}`, "dispatch"),
        });
      },

      cancelOrder: (id) => {
        const at = now();
        const { orders, machines, activity } = get();
        const order = orders.find((o) => o.id === id);
        if (!order || order.status !== "booked") return;
        const ids = new Set(order.machineIds);
        set({
          orders: orders.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)),
          machines: machines.map((m) =>
            ids.has(m.id)
              ? {
                  ...m,
                  stage: "ready",
                  orderId: undefined,
                  updatedAt: at,
                  history: [...m.history, { at, text: `Released from cancelled order ${order.code}`, kind: "released" }],
                }
              : m,
          ),
          activity: logActivity(activity, `Big order ${order.code} cancelled — ${order.machineIds.length} machines back in stock`, "order"),
        });
      },

      shopSell: (machineId, customer, phone, price, warrantyMonths) => {
        const { machines, sales, orders, activity } = get();
        const m = machines.find((x) => x.id === machineId);
        if (!m) return { ok: false, reason: "No machine with this serial number." };
        if (m.stage === "booked") {
          const o = orders.find((x) => x.id === m.orderId);
          return { ok: false, reason: `This machine is booked for big order ${o?.code ?? ""} (${o?.buyer ?? "a buyer"}). Pick another one.` };
        }
        if (m.stage === "sold") return { ok: false, reason: `Already sold to ${m.soldTo ?? "a customer"}.` };
        if (m.stage !== "ready") return { ok: false, reason: "This machine is not checked yet. Finish Check & Grade first." };
        const at = now();
        const sale: ShopSale = {
          id: uid("s"),
          code: `SS-${2201 + sales.length}`,
          machineId,
          customer,
          phone,
          price,
          warrantyMonths,
          at,
        };
        set({
          sales: [sale, ...sales],
          machines: machines.map((x) =>
            x.id === machineId
              ? {
                  ...x,
                  stage: "sold",
                  soldPrice: price,
                  soldTo: customer,
                  updatedAt: at,
                  history: [...x.history, { at, text: `Sold at the shop to ${customer} (${sale.code})`, kind: "sold" }],
                }
              : x,
          ),
          activity: logActivity(activity, `Shop sale ${sale.code}: ${m.brand} ${m.model} to ${customer}`, "sale"),
        });
        return { ok: true, sale };
      },
    }),
    {
      name: "sa-computers-demo-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** True once the saved data has been loaded from this browser. */
export function useHydrated() {
  return useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}
