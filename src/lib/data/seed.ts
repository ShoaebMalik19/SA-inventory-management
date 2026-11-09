import type {
  Activity,
  Batch,
  BigOrder,
  Grade,
  Machine,
  MachineType,
  ShopSale,
  SupplierType,
} from "./types";
import { pickForRequirement } from "./selectors";

/** Small deterministic RNG so the demo looks the same every reset. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CatalogItem = {
  type: MachineType;
  brand: string;
  model: string;
  cpu: string;
  gen: number;
  screen?: number;
  rams: number[];
  storages: number[];
  cost: number; // typical buying price, 8GB/256GB
};

export const CATALOG: CatalogItem[] = [
  { type: "Laptop", brand: "Dell", model: "Latitude 5490", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 8, 16], storages: [256, 256, 512], cost: 12500 },
  { type: "Laptop", brand: "Dell", model: "Latitude 7490", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 16], storages: [256, 512], cost: 14000 },
  { type: "Laptop", brand: "Dell", model: "Latitude 5400", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 8, 16], storages: [256], cost: 13500 },
  { type: "Laptop", brand: "Dell", model: "Latitude 5410", cpu: "Core i5", gen: 10, screen: 14, rams: [8, 16], storages: [256, 512], cost: 17500 },
  { type: "Laptop", brand: "Dell", model: "Latitude 7480", cpu: "Core i7", gen: 7, screen: 14, rams: [8, 16], storages: [256], cost: 13000 },
  { type: "Laptop", brand: "HP", model: "EliteBook 840 G5", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 8, 16], storages: [256], cost: 13000 },
  { type: "Laptop", brand: "HP", model: "EliteBook 840 G6", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 16], storages: [256, 512], cost: 14500 },
  { type: "Laptop", brand: "HP", model: "EliteBook 840 G7", cpu: "Core i5", gen: 10, screen: 14, rams: [8, 16], storages: [256, 512], cost: 18500 },
  { type: "Laptop", brand: "HP", model: "ProBook 440 G6", cpu: "Core i5", gen: 8, screen: 14, rams: [8], storages: [256], cost: 11500 },
  { type: "Laptop", brand: "HP", model: "ProBook 440 G5", cpu: "Core i3", gen: 7, screen: 14, rams: [4, 8], storages: [128, 256], cost: 7500 },
  { type: "Laptop", brand: "Lenovo", model: "ThinkPad T480", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 8, 16], storages: [256, 512], cost: 13500 },
  { type: "Laptop", brand: "Lenovo", model: "ThinkPad T490", cpu: "Core i5", gen: 8, screen: 14, rams: [8, 16], storages: [256, 512], cost: 15000 },
  { type: "Laptop", brand: "Lenovo", model: "ThinkPad T14 Gen 1", cpu: "Core i5", gen: 10, screen: 14, rams: [8, 16], storages: [256, 512], cost: 18000 },
  { type: "Laptop", brand: "Lenovo", model: "ThinkPad L490", cpu: "Core i5", gen: 8, screen: 14, rams: [8], storages: [256], cost: 11500 },
  { type: "Laptop", brand: "Lenovo", model: "ThinkPad X280", cpu: "Core i5", gen: 8, screen: 12.5, rams: [8], storages: [256], cost: 11000 },
  { type: "Laptop", brand: "Apple", model: "MacBook Pro 13 (2019)", cpu: "Core i5", gen: 8, screen: 13.3, rams: [8, 16], storages: [128, 256], cost: 32000 },
  { type: "Desktop", brand: "Dell", model: "OptiPlex 7050 SFF", cpu: "Core i5", gen: 7, rams: [8], storages: [256, 500], cost: 7000 },
  { type: "Desktop", brand: "Dell", model: "OptiPlex 7070 SFF", cpu: "Core i5", gen: 9, rams: [8, 16], storages: [256], cost: 10500 },
  { type: "Desktop", brand: "Lenovo", model: "ThinkCentre M720q", cpu: "Core i5", gen: 8, rams: [8], storages: [256], cost: 9000 },
  { type: "Desktop", brand: "HP", model: "EliteDesk 800 G4", cpu: "Core i5", gen: 8, rams: [8, 16], storages: [256], cost: 9500 },
  { type: "Desktop", brand: "HP", model: "ProDesk 400 G5", cpu: "Core i3", gen: 8, rams: [4, 8], storages: [500], cost: 6000 },
];

const BATCH_PLAN: {
  daysAgo: number;
  supplier: string;
  supplierType: SupplierType;
  size: number;
  models: number[]; // catalog indexes
  note?: string;
}[] = [
  { daysAgo: 96, supplier: "Manyata Tech Park buyback", supplierType: "Corporate buyback", size: 180, models: [0, 5, 10, 13] },
  { daysAgo: 81, supplier: "Al-Noor Traders, Dubai", supplierType: "Import lot", size: 150, models: [1, 6, 11, 15] },
  { daysAgo: 66, supplier: "Whitefield IT refresh", supplierType: "Corporate buyback", size: 210, models: [0, 2, 5, 8, 10] },
  { daysAgo: 51, supplier: "SP Road dealer – Mahaveer Infotech", supplierType: "Dealer", size: 120, models: [9, 16, 20, 4] },
  { daysAgo: 37, supplier: "Electronic City campus refresh", supplierType: "Corporate buyback", size: 160, models: [3, 7, 12, 17, 18] },
  { daysAgo: 23, supplier: "Al-Noor Traders, Dubai", supplierType: "Import lot", size: 200, models: [1, 6, 11, 14, 15, 0] },
  { daysAgo: 9, supplier: "Bellandur office closure", supplierType: "Corporate buyback", size: 190, models: [0, 2, 10, 19, 13, 5] },
  { daysAgo: 2, supplier: "Outer Ring Road IT refresh", supplierType: "Corporate buyback", size: 110, models: [3, 7, 12, 5], note: "Arrived Saturday, 3 boxes still sealed" },
];

const BUYERS = ["ReNew Devices Pvt Ltd", "Metro Refurb Hub", "TechSaathi Rentals", "Campus IT Solutions"];
const WALKIN_NAMES = [
  "Imran Pasha", "Kavya R", "Suresh Gowda", "Ayesha Khan", "Rahul Menon", "Deepa N",
  "Mohammed Zaid", "Priya S", "Arjun Rao", "Fathima B", "Vinay Kumar", "Sneha Patil",
  "Naveen J", "Rukhsar Banu", "Karthik M", "Lakshmi D",
];

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

function serialFor(brand: string, r: () => number) {
  const s = (n: number) => Array.from({ length: n }, () => ALNUM[Math.floor(r() * ALNUM.length)]).join("");
  if (brand === "Dell") return s(7);
  if (brand === "HP") return `5CG${Math.floor(r() * 9) + 1}${s(6)}`;
  if (brand === "Lenovo") return `PF${s(6)}`;
  return `C02${s(9)}`;
}

const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];
const iso = (daysAgo: number, r?: () => number) =>
  new Date(Date.now() - daysAgo * 86_400_000 - (r ? Math.floor(r() * 8) * 3_600_000 : 0)).toISOString();

export const FAIL_CHECKS = ["Display", "Keyboard", "Battery", "Ports", "Camera", "Wi-Fi", "Speakers", "Hinge"];

/** Asking price from cost, grade and spec. */
export function askingPrice(m: Pick<Machine, "cost" | "repairCost" | "grade" | "ram" | "storage">) {
  const gradeMarkup = m.grade === "A" ? 1.38 : m.grade === "B" ? 1.27 : 1.15;
  const extras = (m.ram > 8 ? 1200 : 0) + (m.storage > 256 ? 900 : 0);
  return Math.round(((m.cost + m.repairCost) * gradeMarkup + extras) / 100) * 100 - 1;
}

export type SeedData = {
  machines: Machine[];
  batches: Batch[];
  orders: BigOrder[];
  sales: ShopSale[];
  activity: Activity[];
};

export function buildSeed(): SeedData {
  const r = rng(20161107);
  const machines: Machine[] = [];
  const batches: Batch[] = [];
  const activity: Activity[] = [];
  let mId = 0;

  BATCH_PLAN.forEach((plan, bi) => {
    const batchId = `b${bi + 1}`;
    const code = `B-${1101 + bi}`;
    const date = iso(plan.daysAgo);
    let total = 0;

    for (let i = 0; i < plan.size; i++) {
      const item = CATALOG[pick(plan.models, r)];
      const ram = pick(item.rams, r);
      const storage = pick(item.storages, r);
      const cost =
        Math.round((item.cost + (ram > 8 ? 1500 : ram < 8 ? -1200 : 0) + (storage > 256 ? 1000 : storage < 256 ? -800 : 0)) * (0.9 + r() * 0.2) / 50) * 50;
      total += cost;

      // decide where this machine is today, based on how old the batch is
      const roll = r();
      let stage: Machine["stage"];
      if (plan.daysAgo <= 3) stage = roll < 0.86 ? "checking" : roll < 0.93 ? "repair" : "ready";
      else if (plan.daysAgo <= 10) stage = roll < 0.22 ? "checking" : roll < 0.3 ? "repair" : roll < 0.34 ? "scrap" : "ready";
      else stage = roll < 0.03 ? "repair" : roll < 0.075 ? "scrap" : "ready";

      const graded = stage === "ready" || stage === "repair" || stage === "scrap";
      const gRoll = r();
      const grade: Grade | null = stage === "ready" ? (gRoll < 0.55 ? "A" : gRoll < 0.87 ? "B" : "C") : null;
      const checkedDaysAgo = Math.max(0, plan.daysAgo - 1 - Math.floor(r() * 5));

      const failed =
        stage === "repair" || stage === "scrap"
          ? Array.from(new Set([pick(FAIL_CHECKS, r), ...(r() < 0.3 ? [pick(FAIL_CHECKS, r)] : [])]))
          : [];

      const m: Machine = {
        id: `m${++mId}`,
        serial: serialFor(item.brand, r),
        batchId,
        type: item.type,
        brand: item.brand,
        model: item.model,
        cpu: item.cpu,
        gen: item.gen,
        ram,
        storage,
        storageType: storage === 500 ? "HDD" : "SSD",
        screen: item.screen,
        condition: "Used",
        grade,
        stage,
        location: plan.daysAgo <= 10 ? "Godown" : r() < 0.62 ? "Godown" : "Shop",
        cost,
        repairCost: 0,
        price: 0,
        wiped: stage === "ready",
        battery: item.type === "Laptop" && graded ? Math.round(62 + r() * 36) : undefined,
        failedChecks: failed.length ? failed : undefined,
        addedAt: date,
        updatedAt: graded ? iso(checkedDaysAgo, r) : date,
        history: [{ at: date, text: `Added with batch ${code} from ${plan.supplier}`, kind: "added" }],
      };

      // some ready machines were upgraded on the way
      if (stage === "ready" && m.ram === 4 && r() < 0.7) {
        m.ram = 8;
        m.repairCost += 1400;
        m.history.push({ at: iso(checkedDaysAgo), text: "RAM upgraded 4 GB → 8 GB (₹1,400)", kind: "upgrade" });
      }
      if (stage === "ready" && r() < 0.06) {
        m.repairCost += 1800;
        m.history.push({ at: iso(checkedDaysAgo), text: "Battery replaced (₹1,800)", kind: "repair" });
      }
      if (graded) {
        m.history.push({
          at: m.updatedAt,
          text:
            stage === "ready"
              ? `Checked: all tests passed · Grade ${grade} · Data wiped`
              : stage === "repair"
                ? `Checked: failed ${failed.join(", ")} — sent to repair`
                : `Checked: failed ${failed.join(", ")} — marked as scrap`,
          kind: "checked",
        });
      }
      m.price = m.grade ? askingPrice(m) : 0;
      machines.push(m);
    }

    batches.push({
      id: batchId,
      code,
      supplier: plan.supplier,
      supplierType: plan.supplierType,
      date,
      totalCost: total,
      count: plan.size,
      note: plan.note,
    });
    activity.push({ id: `a-b${bi}`, at: date, text: `New batch ${code}: ${plan.size} machines from ${plan.supplier}`, kind: "batch" });
  });

  // ---- big orders: 3 dispatched in the past, 1 currently booked ----
  const orders: BigOrder[] = [];
  const orderPlans: { daysAgo: number; buyer: string; qty: number; unitPrice: number; dispatched: boolean; desktop?: boolean; grade: Grade }[] = [
    { daysAgo: 88, buyer: BUYERS[0], qty: 120, unitPrice: 16900, dispatched: true, grade: "C" },
    { daysAgo: 62, buyer: BUYERS[1], qty: 130, unitPrice: 17600, dispatched: true, grade: "B" },
    { daysAgo: 44, buyer: BUYERS[3], qty: 100, unitPrice: 17400, dispatched: true, grade: "B" },
    { daysAgo: 20, buyer: BUYERS[2], qty: 60, unitPrice: 11200, dispatched: true, desktop: true, grade: "B" },
    { daysAgo: 12, buyer: BUYERS[0], qty: 100, unitPrice: 17100, dispatched: true, grade: "C" },
    { daysAgo: 1, buyer: BUYERS[0], qty: 100, unitPrice: 17500, dispatched: false, grade: "B" },
  ];

  orderPlans.forEach((op, oi) => {
    const need = op.desktop
      ? { type: "Desktop" as const, cpu: "Core i5", minGen: 7, ram: 8, storage: 256, grade: op.grade, qty: op.qty }
      : { type: "Laptop" as const, cpu: "Core i5", minGen: 8, ram: 8, storage: 256, grade: op.grade, qty: op.qty };
    const { picked } = pickForRequirement(machines, need, (m) => m.brand !== "Apple" && new Date(m.addedAt).getTime() < Date.now() - (op.daysAgo + 3) * 86_400_000);
    const code = `BO-${1040 + oi}`;
    const createdAt = iso(op.daysAgo);
    const dispatchedAt = op.dispatched ? iso(op.daysAgo - 2) : undefined;
    const order: BigOrder = {
      id: `o${oi + 1}`,
      code,
      buyer: op.buyer,
      createdAt,
      status: op.dispatched ? "dispatched" : "booked",
      need,
      unitPrice: op.unitPrice,
      machineIds: picked.map((m) => m.id),
      dispatchedAt,
    };
    picked.forEach((m) => {
      m.orderId = order.id;
      m.history.push({ at: createdAt, text: `Booked for big order ${code} (${op.buyer})`, kind: "booked" });
      if (op.dispatched) {
        m.stage = "sold";
        m.soldPrice = op.unitPrice;
        m.soldTo = op.buyer;
        m.history.push({ at: dispatchedAt!, text: `Dispatched to ${op.buyer} with ${code}`, kind: "sold" });
        m.updatedAt = dispatchedAt!;
      } else {
        m.stage = "booked";
        m.updatedAt = createdAt;
      }
    });
    orders.push(order);
    activity.push({ id: `a-o${oi}`, at: createdAt, text: `Big order ${code} booked: ${picked.length} machines for ${op.buyer}`, kind: "order" });
    if (dispatchedAt)
      activity.push({ id: `a-d${oi}`, at: dispatchedAt, text: `Big order ${code} dispatched to ${op.buyer}`, kind: "dispatch" });
  });

  // ---- shop (walk-in) sales ----
  const sales: ShopSale[] = [];
  const readyNow = machines.filter((m) => m.stage === "ready");
  for (let i = 0; i < 70; i++) {
    const m = readyNow[Math.floor(r() * readyNow.length)];
    if (!m || m.stage !== "ready") continue;
    const daysAgo = Math.max(0, Math.floor((1 - i / 70) * 40 + r() * 1.5));
    if (new Date(m.addedAt).getTime() > Date.now() - (daysAgo + 2) * 86_400_000) continue;
    const at = iso(daysAgo, r);
    const customer = pick(WALKIN_NAMES, r);
    const price = Math.round((m.price * (0.95 + r() * 0.06)) / 100) * 100;
    const code = `SS-${2201 + sales.length}`;
    m.stage = "sold";
    m.soldPrice = price;
    m.soldTo = customer;
    m.location = "Shop";
    m.updatedAt = at;
    m.history.push({ at, text: `Sold at the shop to ${customer} (${code})`, kind: "sold" });
    sales.push({
      id: `s${sales.length + 1}`,
      code,
      machineId: m.id,
      customer,
      phone: `9${Math.floor(100000000 + r() * 899999999)}`,
      price,
      warrantyMonths: 3,
      at,
    });
    activity.push({ id: `a-s${i}`, at, text: `Shop sale ${code}: ${m.brand} ${m.model} to ${customer}`, kind: "sale" });
  }

  activity.sort((a, b) => b.at.localeCompare(a.at));
  return { machines, batches, orders, sales, activity };
}
