import "server-only";
import type { Q } from "./db";
import type {
  Activity,
  Batch,
  BigOrder,
  HistoryEvent,
  Machine,
  Requirement,
  ReturnRecord,
  Role,
  ShopSale,
  Staff,
} from "@/lib/data/types";
import { can } from "@/lib/roles";

/** Everything the screens need. Loaded once, then kept fresh with patches. */
export type Snapshot = {
  machines: Machine[];
  batches: Batch[];
  orders: BigOrder[];
  sales: ShopSale[];
  returns: ReturnRecord[];
  activity: Activity[];
  staff: Staff[];
};

/** Changes sent back after an action; the browser merges them in by id. */
export type Patch = Partial<Snapshot> & { replaceAll?: Snapshot };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : undefined);
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

type Row = Record<string, unknown>;

function toMachine(r: Row, history: HistoryEvent[]): Machine {
  return {
    id: r.id as string,
    serial: r.serial as string,
    batchId: r.batch_id as string,
    type: r.type as Machine["type"],
    brand: r.brand as string,
    model: r.model as string,
    cpu: r.cpu as string,
    gen: Number(r.gen),
    ram: Number(r.ram),
    storage: Number(r.storage),
    storageType: r.storage_type as Machine["storageType"],
    screen: num(r.screen),
    condition: r.condition as Machine["condition"],
    grade: (r.grade as Machine["grade"]) ?? null,
    stage: r.stage as Machine["stage"],
    location: r.location as Machine["location"],
    cost: Number(r.cost),
    repairCost: Number(r.repair_cost),
    price: Number(r.price),
    soldPrice: num(r.sold_price),
    soldTo: (r.sold_to as string) ?? undefined,
    orderId: (r.order_id as string) ?? undefined,
    wiped: !!r.wiped,
    battery: num(r.battery),
    failedChecks: (r.failed_checks as string[] | null) ?? undefined,
    addedAt: iso(r.added_at)!,
    updatedAt: iso(r.updated_at)!,
    history,
  };
}

async function historyFor(q: Q, ids?: string[]) {
  const rows = ids
    ? await q.query<Row>("select machine_id, at, text, kind, by_name from machine_events where machine_id = any($1) order by at, id", [ids])
    : await q.query<Row>("select machine_id, at, text, kind, by_name from machine_events order by at, id");
  const map = new Map<string, HistoryEvent[]>();
  for (const r of rows) {
    const list = map.get(r.machine_id as string) ?? [];
    list.push({ at: iso(r.at)!, text: r.text as string, kind: r.kind as HistoryEvent["kind"], by: (r.by_name as string) ?? undefined });
    map.set(r.machine_id as string, list);
  }
  return map;
}

export async function machinesByIds(q: Q, ids: string[]): Promise<Machine[]> {
  if (!ids.length) return [];
  const [rows, hist] = await Promise.all([q.query<Row>("select * from machines where id = any($1)", [ids]), historyFor(q, ids)]);
  return rows.map((r) => toMachine(r, hist.get(r.id as string) ?? []));
}

export async function machineBySerial(q: Q, serial: string) {
  const rows = await q.query<Row>("select id from machines where upper(serial) = upper($1)", [serial.trim()]);
  return rows[0] ? (await machinesByIds(q, [rows[0].id as string]))[0] : undefined;
}

const toBatch = (r: Row): Batch => ({
  id: r.id as string,
  code: r.code as string,
  supplier: r.supplier as string,
  supplierType: r.supplier_type as Batch["supplierType"],
  date: iso(r.date)!,
  totalCost: Number(r.total_cost),
  count: Number(r.count),
  note: (r.note as string) ?? undefined,
});

export async function batchesByIds(q: Q, ids?: string[]) {
  const rows = ids
    ? await q.query<Row>("select * from batches where id = any($1)", [ids])
    : await q.query<Row>("select * from batches order by date");
  return rows.map(toBatch);
}

export async function ordersByIds(q: Q, ids?: string[]): Promise<BigOrder[]> {
  const rows = ids
    ? await q.query<Row>("select * from orders where id = any($1)", [ids])
    : await q.query<Row>("select * from orders order by created_at");
  const items = await q.query<Row>(
    ids ? "select order_id, machine_id from order_items where order_id = any($1)" : "select order_id, machine_id from order_items",
    ids ? [ids] : [],
  );
  const byOrder = new Map<string, string[]>();
  for (const i of items) byOrder.set(i.order_id as string, [...(byOrder.get(i.order_id as string) ?? []), i.machine_id as string]);
  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    buyer: r.buyer as string,
    createdAt: iso(r.created_at)!,
    status: r.status as BigOrder["status"],
    need: (typeof r.need === "string" ? JSON.parse(r.need) : r.need) as Requirement,
    unitPrice: Number(r.unit_price),
    machineIds: byOrder.get(r.id as string) ?? [],
    dispatchedAt: iso(r.dispatched_at),
  }));
}

const toSale = (r: Row): ShopSale => ({
  id: r.id as string,
  code: r.code as string,
  machineId: r.machine_id as string,
  customer: r.customer as string,
  phone: r.phone as string,
  price: Number(r.price),
  warrantyMonths: Number(r.warranty_months),
  at: iso(r.at)!,
  by: (r.by_name as string) ?? undefined,
});

const toReturn = (r: Row): ReturnRecord => ({
  id: r.id as string,
  code: r.code as string,
  machineId: r.machine_id as string,
  from: r.source as ReturnRecord["from"],
  refCode: r.ref_code as string,
  customer: r.customer as string,
  reason: r.reason as string,
  refund: Number(r.refund),
  at: iso(r.at)!,
  by: (r.by_name as string) ?? undefined,
});

const toActivity = (r: Row): Activity => ({
  id: r.id as string,
  at: iso(r.at)!,
  text: r.text as string,
  kind: r.kind as Activity["kind"],
  by: (r.by_name as string) ?? undefined,
});

export async function salesByIds(q: Q, ids: string[]) {
  return (await q.query<Row>("select * from sales where id = any($1)", [ids])).map(toSale);
}
export async function returnsByIds(q: Q, ids: string[]) {
  return (await q.query<Row>("select * from returns where id = any($1)", [ids])).map(toReturn);
}
export async function activityByIds(q: Q, ids: string[]) {
  return (await q.query<Row>("select * from activity where id = any($1)", [ids])).map(toActivity);
}
export async function staffList(q: Q): Promise<Staff[]> {
  return (await q.query<Row>("select id, name, role, active from staff order by case role when 'owner' then 0 when 'manager' then 1 when 'technician' then 2 else 3 end, name")).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    role: r.role as Role,
    active: !!r.active,
  }));
}

export async function loadSnapshot(q: Q): Promise<Snapshot> {
  const [mRows, hist, batches, orders, sales, returns, activity, staff] = await Promise.all([
    q.query<Row>("select * from machines"),
    historyFor(q),
    batchesByIds(q),
    ordersByIds(q),
    q.query<Row>("select * from sales order by at desc"),
    q.query<Row>("select * from returns order by at desc"),
    q.query<Row>("select * from activity order by at desc limit 200"),
    staffList(q),
  ]);
  return {
    machines: mRows.map((r) => toMachine(r, hist.get(r.id as string) ?? [])),
    batches,
    orders,
    sales: sales.map(toSale),
    returns: returns.map(toReturn),
    activity: activity.map(toActivity),
    staff,
  };
}

/** Technicians and counter staff don't see buying prices, profit or batch costs. */
export function forRole<T extends Partial<Snapshot>>(data: T, role: Role): T {
  const out = { ...data };
  if (!can(role, "staff")) delete out.staff;
  if (can(role, "viewMoney")) return out;
  if (out.machines) out.machines = out.machines.map((m) => ({ ...m, cost: 0, repairCost: 0 }));
  if (out.batches) out.batches = out.batches.map((b) => ({ ...b, totalCost: 0 }));
  if (out.orders) out.orders = out.orders.map((o) => ({ ...o, unitPrice: 0 }));
  return out;
}
