/**
 * Data model for the S.A Computers prototype.
 * This file + store.ts are the only things that change when we move to Supabase.
 */

export type MachineType = "Laptop" | "Desktop";
export type Condition = "Used" | "Refurbished" | "New";
export type Grade = "A" | "B" | "C";
export type Location = "Shop" | "Godown";

/** Where a machine is in its life. Shown with plain words via STAGES below. */
export type Stage = "checking" | "repair" | "ready" | "booked" | "sold" | "scrap";

export const STAGES: Record<Stage, { label: string; hint: string }> = {
  checking: { label: "Waiting for check", hint: "New arrival, not tested yet" },
  repair: { label: "In repair", hint: "Needs a part or fix before sale" },
  ready: { label: "Ready to sell", hint: "Checked, graded and wiped" },
  booked: { label: "Booked", hint: "Set aside for a big order" },
  sold: { label: "Sold", hint: "Left the shop" },
  scrap: { label: "Scrap / parts", hint: "Not worth repairing" },
};

export const STAGE_ORDER: Stage[] = ["checking", "repair", "ready", "booked", "sold", "scrap"];

export type HistoryEvent = {
  at: string; // ISO
  text: string;
  by?: string; // staff name
  kind: "added" | "checked" | "repair" | "upgrade" | "moved" | "booked" | "released" | "sold" | "returned" | "edited" | "undone";
};

export type Machine = {
  id: string;
  serial: string;
  batchId: string;
  type: MachineType;
  brand: string;
  model: string;
  cpu: string; // "Core i5"
  gen: number; // 8 → 8th gen
  ram: number; // GB
  storage: number; // GB
  storageType: "SSD" | "HDD";
  screen?: number; // inches, laptops only
  condition: Condition;
  grade: Grade | null;
  stage: Stage;
  location: Location;
  cost: number; // purchase cost share
  repairCost: number;
  price: number; // asking price
  soldPrice?: number;
  soldTo?: string;
  orderId?: string;
  wiped: boolean;
  battery?: number; // % health, laptops
  failedChecks?: string[];
  addedAt: string;
  updatedAt: string;
  history: HistoryEvent[];
};

export type SupplierType = "Corporate buyback" | "Dealer" | "Import lot" | "Walk-in seller";
export const SUPPLIER_TYPES: SupplierType[] = ["Corporate buyback", "Dealer", "Import lot", "Walk-in seller"];

export type Batch = {
  id: string;
  code: string; // "B-1101"
  supplier: string;
  supplierType: SupplierType;
  date: string;
  totalCost: number;
  count: number;
  note?: string;
  billNo?: string; // supplier's bill number
  dueDate?: string; // when we must pay the supplier
};

/** What a buyer asks for in a big order. */
export type Requirement = {
  type: MachineType;
  cpu: string;
  minGen: number;
  ram: number;
  storage: number;
  grade: Grade;
  qty: number;
};

export type BigOrder = {
  id: string;
  code: string; // "BO-1042"
  buyer: string;
  createdAt: string;
  status: "booked" | "dispatched" | "cancelled";
  need: Requirement;
  unitPrice: number;
  machineIds: string[];
  dispatchedAt?: string;
};

export type ShopSale = {
  id: string;
  code: string; // "SS-2201"
  machineId: string;
  customer: string;
  phone: string;
  price: number;
  warrantyMonths: number;
  at: string;
  by?: string;
};

export type Activity = {
  id: string;
  at: string;
  text: string;
  kind: "batch" | "check" | "order" | "dispatch" | "sale" | "repair" | "return" | "move" | "staff" | "payment" | "settings" | "supplier" | "fix" | "backup";
  by?: string;
  detail?: string; // what exactly changed, e.g. "RAM 8 GB → 16 GB"
};

export type ReturnRecord = {
  id: string;
  code: string; // "RT-3001"
  machineId: string;
  from: "shop" | "order";
  refCode: string; // the sale or order it came back from
  customer: string;
  reason: string;
  refund: number;
  at: string;
  by?: string;
};

export type Role = "owner" | "manager" | "technician" | "counter";

export type Staff = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
};

/** The single "spec" a buyer thinks in: i5 8th gen · 8GB · 256GB. */
export const specKey = (m: Pick<Machine, "type" | "cpu" | "gen" | "ram" | "storage">) =>
  `${m.type}|${m.cpu}|${m.gen}|${m.ram}|${m.storage}`;

/* ---------------- Billing ---------------- */

export type BusinessSettings = {
  businessName: string;
  address: string;
  phone: string;
  gstin: string;
  state: string;
  invoicePrefix: string;
  gstScheme: "margin" | "normal";
  gstRate: number;
  warrantyMonths: number;
  bankDetails: string;
  invoiceNote: string;
};

export type Buyer = {
  id: string;
  name: string;
  phone?: string;
  gstin?: string;
  state: string;
  address?: string;
  termsDays: number;
};

export type InvoiceLine = {
  machineId: string;
  serial: string;
  description: string;
  hsn: string;
  amount: number; // selling price incl. GST
  purchase?: number; // our buying price — only for margin scheme maths; hidden from counter/technician
};

export type Invoice = {
  id: string;
  number: string; // "SA/26-27/0012"
  fy: string;
  date: string;
  kind: "shop" | "order";
  refId: string;
  refCode: string; // SS-2231 / BO-1046
  buyerName: string;
  buyerPhone?: string;
  buyerGstin?: string;
  buyerState: string;
  buyerAddress?: string;
  intra: boolean;
  scheme: "margin" | "normal";
  rate: number;
  lines: InvoiceLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  dueDate: string;
  by?: string;
  cancelledAt?: string; // set when the bill was cancelled by a credit note
  cancelReason?: string;
  creditNote?: string; // "CN/26-27/0001"
};

export type PaymentMode = "Cash" | "UPI" | "Card" | "Bank transfer" | "Cheque";
export const PAYMENT_MODES: PaymentMode[] = ["Cash", "UPI", "Card", "Bank transfer", "Cheque"];

export type Payment = {
  id: string;
  invoiceId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  at: string;
  by?: string;
};

/** Someone we buy stock from. */
export type Supplier = {
  id: string;
  name: string;
  kind: SupplierType;
  phone?: string;
  gstin?: string;
  state: string;
  address?: string;
  termsDays: number; // days we get to pay
};

/** Money we paid a supplier against a purchase batch. */
export type SupplierPayment = {
  id: string;
  batchId: string;
  supplier: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  at: string;
  by?: string;
};

/** "sample" while the shop is trying the app; "live" once its real stock is in. */
export type DataMode = "sample" | "live";

/** One saved copy of everything (without the data itself). */
export type BackupInfo = { id: string; at: string; kind: "auto" | "manual" | "before-restore"; by?: string; size: number; rows: number };
