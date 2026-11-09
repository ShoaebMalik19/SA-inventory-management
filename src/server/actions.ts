"use server";

import { getDb } from "./db";
import { currentUser, endSession, NotAllowed, requireUser, startSession } from "./auth";
import { forRole, loadSnapshot, type Patch } from "./repo";
import * as svc from "./service";
import { loadSampleData } from "./seed-db";
import type { SupplierInput } from "./suppliers";
import { verifyPin } from "./pin";
import type { Permission } from "@/lib/roles";
import type { BusinessSettings, Grade, Location, PaymentMode, Requirement, Role, SupplierType } from "@/lib/data/types";

/**
 * The only door into the database from the browser.
 * Every action: check who you are → check your role → run the change in one transaction → return what changed.
 */

export type Result<X = object> = ({ ok: true; patch: Patch } & X) | { ok: false; error: string };

async function run<X extends object>(
  permission: Permission,
  fn: (q: Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["tx"]>[0]>[0], user: Awaited<ReturnType<typeof requireUser>>) => Promise<Patch & X>,
): Promise<Result<X>> {
  try {
    const user = await requireUser(permission);
    const db = await getDb();
    const out = await db.tx((q) => fn(q, user));
    const { machines, batches, orders, sales, returns, activity, staff, settings, buyers, invoices, payments, suppliers, supplierPayments, dataMode, replaceAll, ...extra } = out;
    const patch = forRole({ machines, batches, orders, sales, returns, activity, staff, settings, buyers, invoices, payments, suppliers, supplierPayments, dataMode }, user.role);
    return { ok: true, patch: { ...patch, replaceAll: replaceAll ? forRole(replaceAll, user.role) : undefined }, ...(extra as X) };
  } catch (e) {
    if (e instanceof svc.UserError || e instanceof NotAllowed) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong saving this. Please try again." };
  }
}

/* ---- login ---- */

export async function login(staffId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const rows = await db.query<{ id: string; pin_hash: string; active: boolean }>("select id, pin_hash, active from staff where id=$1", [staffId]);
  const s = rows[0];
  // small delay makes guessing PINs slow
  await new Promise((r) => setTimeout(r, 350));
  if (!s || !s.active || !verifyPin(pin, s.pin_hash)) return { ok: false, error: "Wrong PIN. Try again." };
  await startSession(s.id);
  return { ok: true };
}

export async function logout() {
  await endSession();
}

/* ---- stock ---- */

export async function addBatch(input: {
  supplier: string;
  supplierType: SupplierType;
  totalCost: number;
  location: Location;
  items: svc.NewMachine[];
  billNo?: string;
  payDays?: number;
  paidNow?: number;
  paidMode?: PaymentMode;
}) {
  return run("addStock", (q, u) => svc.addBatch(q, u, input));
}

export async function checkMachine(input: svc.CheckInput) {
  return run("check", (q, u) => svc.checkMachine(q, u, input));
}

export async function finishRepair(input: { id: string; part: string; cost: number; grade: Grade }) {
  return run("check", (q, u) => svc.finishRepair(q, u, input));
}

export async function moveMachines(input: { ids: string[]; to: Location }) {
  return run("move", (q, u) => svc.moveMachines(q, u, input));
}

export async function setPrice(input: { id: string; price: number }) {
  return run("orders", (q, u) => svc.setPrice(q, u, input));
}

/* ---- selling ---- */

export async function createOrder(input: { buyer: string; need: Requirement; unitPrice: number; buyerDetails?: svc.BuyerInput }) {
  return run("orders", (q, u) => svc.createOrder(q, u, input));
}

export async function dispatchOrder(id: string) {
  return run("orders", (q, u) => svc.dispatchOrder(q, u, { id }));
}

export async function cancelOrder(id: string) {
  return run("orders", (q, u) => svc.cancelOrder(q, u, { id }));
}

export async function shopSell(input: {
  machineId: string;
  customer: string;
  phone: string;
  price: number;
  warrantyMonths: number;
  paymentMode: PaymentMode;
  reference?: string;
}) {
  return run("sell", (q, u) => svc.shopSell(q, u, input));
}

export async function recordReturn(input: { machineId: string; reason: string; refund: number }) {
  return run("returns", (q, u) => svc.recordReturn(q, u, input));
}

/* ---- owner ---- */

export async function saveStaff(input: { id?: string; name: string; role: Role; pin?: string; active: boolean }) {
  return run("staff", (q, u) => svc.saveStaff(q, u, input));
}

export async function resetDemoData() {
  return run("reset", async (q) => {
    await svc.assertSampleMode(q);
    await loadSampleData(q);
    return { replaceAll: await loadSnapshot(q) };
  });
}

/** Who am I — used after login. */
export async function whoAmI() {
  return currentUser();
}

/* ---- money ---- */

export async function recordPayment(input: { invoiceId: string; amount: number; mode: PaymentMode; reference?: string }) {
  return run("billing", (q, u) => svc.recordPayment(q, u, input));
}

export async function saveBuyer(input: svc.BuyerInput & { id?: string }) {
  return run("billing", (q, u) => svc.saveBuyer(q, u, input));
}

export async function saveSettings(input: BusinessSettings) {
  return run("settings", (q, u) => svc.saveSettings(q, u, input));
}

/* ---- suppliers ---- */

export async function paySupplier(input: { batchId: string; amount: number; mode: PaymentMode; reference?: string }) {
  return run("billing", (q, u) => svc.paySupplier(q, u, input));
}

export async function saveSupplier(input: SupplierInput & { id?: string }) {
  return run("billing", (q, u) => svc.saveSupplier(q, u, input));
}

/* ---- real data ---- */

export async function importStock(input: { rows: svc.ImportRow[]; alreadyPaid: boolean }) {
  return run("importStock", (q, u) => svc.importStock(q, u, input));
}

export async function startLive(input: { confirm: string }) {
  return run("reset", async (q, u) => {
    await svc.startLive(q, u, input);
    return { replaceAll: await loadSnapshot(q) };
  });
}
