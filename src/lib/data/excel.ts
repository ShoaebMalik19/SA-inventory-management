"use client";

import * as XLSX from "xlsx";
import { CATALOG } from "./seed";
import type { MachineType } from "./types";
import type { NewMachineInput } from "./store";
import type { ImportRow } from "@/server/service";

/** Columns of the sample/template sheet. */
export const SHEET_COLUMNS = ["Serial", "Type", "Brand", "Model", "Processor", "Gen", "RAM (GB)", "Storage (GB)", "Cost (₹)"];

/** A ready-made sheet of 200 machines, so the demo can show a real upload. */
export function downloadSampleSheet(rows = 200) {
  const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const rnd = (n: number) => Array.from({ length: n }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join("");
  const picks = [0, 1, 5, 6, 10, 11, 3, 12];
  const data = Array.from({ length: rows }, () => {
    const c = CATALOG[picks[Math.floor(Math.random() * picks.length)]];
    const serial = c.brand === "Dell" ? rnd(7) : c.brand === "HP" ? `5CG${rnd(7)}` : `PF${rnd(6)}`;
    const ram = c.rams[Math.floor(Math.random() * c.rams.length)];
    const storage = c.storages[Math.floor(Math.random() * c.storages.length)];
    return {
      Serial: serial,
      Type: c.type,
      Brand: c.brand,
      Model: c.model,
      Processor: c.cpu.replace("Core ", ""),
      Gen: c.gen,
      "RAM (GB)": ram,
      "Storage (GB)": storage,
      "Cost (₹)": Math.round((c.cost * (0.92 + Math.random() * 0.16)) / 50) * 50,
    };
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: SHEET_COLUMNS });
  ws["!cols"] = SHEET_COLUMNS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Machines");
  XLSX.writeFile(wb, `sample-batch-${rows}-machines.xlsx`);
}

export type ParsedRow = { row: number; data?: NewMachineInput; error?: string; raw: Record<string, unknown> };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const ALIASES: Record<string, string[]> = {
  serial: ["serial", "serialno", "serialnumber", "servicetag", "sn", "srno"],
  type: ["type", "category", "devicetype"],
  brand: ["brand", "make", "oem"],
  model: ["model", "modelname"],
  cpu: ["processor", "cpu", "proc"],
  gen: ["gen", "generation", "cpugen"],
  ram: ["ram", "ramgb", "memory"],
  storage: ["storage", "storagegb", "ssd", "hdd", "disk", "harddisk"],
  cost: ["cost", "price", "costrs", "purchaseprice", "rate"],
};

function field(raw: Record<string, unknown>, key: keyof typeof ALIASES) {
  for (const [k, v] of Object.entries(raw)) if (ALIASES[key].includes(norm(k))) return v;
  return undefined;
}
const num = (v: unknown) => {
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

export async function parseSheet(file: File, existingSerials: Set<string>): Promise<ParsedRow[]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const seen = new Set<string>();

  return rows.map((raw, i) => {
    const row = i + 2; // header is row 1
    const serial = String(field(raw, "serial") ?? "").trim().toUpperCase();
    if (!serial) return { row, raw, error: "Serial number is missing" };
    if (seen.has(serial)) return { row, raw, error: "Same serial appears twice in this sheet" };
    if (existingSerials.has(serial)) return { row, raw, error: "This serial is already in your stock" };
    seen.add(serial);

    const brand = String(field(raw, "brand") ?? "").trim();
    const model = String(field(raw, "model") ?? "").trim();
    if (!brand || !model) return { row, raw, error: "Brand or model is missing" };

    const cpuRaw = String(field(raw, "cpu") ?? "").toLowerCase();
    const cpuMatch = cpuRaw.match(/i([3579])/);
    const cpu = cpuMatch ? `Core i${cpuMatch[1]}` : "Core i5";
    const genInCpu = cpuRaw.match(/(\d{1,2})\s*(th|st|nd|rd)?\s*gen/);
    const gen = num(field(raw, "gen")) || (genInCpu ? +genInCpu[1] : NaN);
    if (!gen) return { row, raw, error: "Processor generation is missing" };

    const ram = num(field(raw, "ram"));
    const storage = num(field(raw, "storage"));
    if (!ram || !storage) return { row, raw, error: "RAM or storage is missing" };

    const typeRaw = String(field(raw, "type") ?? "").toLowerCase();
    const type: MachineType = typeRaw.startsWith("d") ? "Desktop" : "Laptop";
    const storageRaw = String(field(raw, "storage") ?? "").toLowerCase();

    return {
      row,
      raw,
      data: {
        serial,
        type,
        brand,
        model,
        cpu,
        gen,
        ram,
        storage,
        storageType: storageRaw.includes("hdd") || storage === 500 || storage === 1000 ? "HDD" : "SSD",
        screen: type === "Laptop" ? 14 : undefined,
        cost: num(field(raw, "cost")) || 0,
      },
    };
  });
}

/* ======================================================================
 * Importing the stock a shop already has
 * Shop sheets are messy: any column order, "8 GB DDR4", "i5-8350U", "1 TB", Excel dates,
 * "Ready"/"OK"/"Faulty" as status. We read what we can and say plainly what we couldn't.
 * ==================================================================== */


export const IMPORT_COLUMNS = [
  "Serial", "Brand", "Model", "Processor", "Gen", "RAM (GB)", "Storage (GB)", "Storage type",
  "Status", "Grade", "Location", "Buying price (₹)", "Selling price (₹)", "Battery %", "Supplier", "Bought on",
];

export function downloadImportTemplate() {
  const rows = [
    ["5CG8301ABC", "HP", "EliteBook 840 G5", "i5-8350U", 8, 8, 256, "SSD", "Ready", "A", "Shop", 13500, 21999, 86, "Hebbal office IT refresh", "2026-09-12"],
    ["PF1K2L3M", "Lenovo", "ThinkPad T480", "i5-8250U", 8, 16, 512, "SSD", "In repair", "", "Godown", 14200, "", "", "Metro dealer", "2026-10-02"],
    ["7HX9Q2", "Dell", "OptiPlex 7060", "i5-8500", 8, 8, 500, "HDD", "Not checked", "", "Godown", 9800, "", "", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS, ...rows]);
  ws["!cols"] = IMPORT_COLUMNS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.writeFile(wb, "sa-computers-stock-template.xlsx");
}

const STOCK_ALIASES = {
  // "Sl No" / "Sr No" in Indian sheets are row numbers, not serials — never use them
  serial: ["serialno", "serialnumber", "servicetag", "serial", "sn", "s/n", "tag", "assettag", "imei"],
  type: ["type", "category", "devicetype", "producttype"],
  brand: ["brand", "make", "oem", "company", "manufacturer"],
  model: ["model", "modelname", "product", "item", "description", "laptop", "name"],
  cpu: ["processor", "cpu", "proc", "chip"],
  gen: ["gen", "generation", "cpugen", "processorgen"],
  ram: ["ram", "ramgb", "memory", "memorygb"],
  storage: ["storage", "storagegb", "ssd", "hdd", "disk", "harddisk", "rom", "hdd/ssd", "ssdhdd", "drive"],
  storageType: ["storagetype", "disktype", "drivetype"],
  status: ["status", "stage", "stockstatus", "state", "condition", "working"],
  grade: ["grade", "quality", "cosmeticgrade"],
  location: ["location", "place", "kept", "keptat", "store", "where", "godownshop"],
  cost: ["buyingprice", "buyingpricers", "cost", "costrs", "costprice", "cp", "purchaseprice", "purchasepricers", "purchase", "landingcost", "landing", "rate"],
  price: ["sellingprice", "sellingpricers", "saleprice", "sp", "mrp", "askingprice", "price", "pricers"],
  battery: ["battery", "batteryhealth", "battery%", "batterypercent", "bh"],
  supplier: ["supplier", "vendor", "boughtfrom", "party", "source", "seller", "from"],
  date: ["boughton", "purchasedate", "date", "inwarddate", "boughtdate", "dateofpurchase", "receivedon"],
} as const;
type StockKey = keyof typeof STOCK_ALIASES;
export const STOCK_FIELD_LABEL: Record<StockKey, string> = {
  serial: "Serial", type: "Laptop / desktop", brand: "Brand", model: "Model", cpu: "Processor", gen: "Generation",
  ram: "RAM", storage: "Storage", storageType: "SSD / HDD", status: "Status", grade: "Grade", location: "Location",
  cost: "Buying price", price: "Selling price", battery: "Battery", supplier: "Supplier", date: "Bought on",
};

const n2 = (s: string) => s.toLowerCase().replace(/[^a-z0-9%/]/g, "");
const firstNum = (v: unknown) => {
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const DESKTOP_HINT = /optiplex|prodesk|elitedesk|thinkcentre|vostro\s*3\d{3}\s*(mt|sff)|desktop|\bsff\b|\btiny\b|\bmt\b|\baio\b|all.in.one|imac|mini pc/i;
const BRANDS = ["Dell", "HP", "Lenovo", "Apple", "Acer", "Asus", "Toshiba", "Fujitsu", "Microsoft", "Samsung", "LG", "MSI", "Panasonic", "Sony"];

/** Read "i5-8350U", "Core i7 10th gen", "Ryzen 5 3500U" into a processor family and generation. */
export function readCpu(raw: string, genCol: unknown): { cpu: string; gen: number } | null {
  const s = raw.toLowerCase();
  const genFromCol = firstNum(genCol);
  const ryzen = s.match(/ryzen\s*([3579])(?:\s*(?:pro\s*)?(\d)\d{3})?/);
  if (ryzen) return { cpu: `Ryzen ${ryzen[1]}`, gen: genFromCol || (ryzen[2] ? +ryzen[2] : NaN) };
  const core = s.match(/i\s*([3579])/);
  if (!core) {
    if (/celeron|pentium/.test(s)) return { cpu: /celeron/.test(s) ? "Celeron" : "Pentium", gen: genFromCol || 1 };
    if (/m1|m2|m3/.test(s)) return { cpu: `Apple ${s.match(/m[123]/)![0].toUpperCase()}`, gen: genFromCol || +s.match(/m([123])/)![1] };
    return null;
  }
  let gen = genFromCol;
  const said = s.match(/(\d{1,2})\s*(st|nd|rd|th)?\s*gen/);
  if (!gen && said) gen = +said[1];
  const model = s.match(/i\s*[3579]\s*[- ]?\s*(\d{4,5})/);
  if (!gen && model) {
    const d = model[1];
    gen = d.length === 5 ? +d.slice(0, 2) : d.startsWith("1") ? +d.slice(0, 2) : +d[0];
  }
  return { cpu: `Core i${core[1]}`, gen };
}

function readStatus(v: unknown, hasGrade: boolean): ImportRow["stage"] | "sold" {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return hasGrade ? "ready" : "checking";
  if (/sold|dispatch|deliver/.test(s)) return "sold";
  if (/scrap|dead|part|e-?waste|not working|beyond/.test(s)) return "scrap";
  if (/repair|fault|service|defect|issue|problem|board|display|keyboard|hinge/.test(s)) return "repair";
  if (/check|test|pending|untested|new arrival|not checked|qc|arriv|inward/.test(s)) return "checking";
  if (/ready|ok|good|working|available|in stock|stock|sale|done|pass/.test(s)) return "ready";
  return hasGrade ? "ready" : "checking";
}

function readDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  // 12/09/2026 or 12-09-2026 — Indian sheets are day first
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    const d = new Date(Date.UTC(y, +dmy[2] - 1, +dmy[1], 6));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export type StockParse = {
  rows: { row: number; data?: ImportRow; error?: string; skipped?: string; raw: Record<string, unknown> }[];
  columns: Partial<Record<StockKey, string>>; // field → the sheet's column name
  ignored: string[];
  sheetName: string;
};

export async function parseStockSheet(file: File, existingSerials: Set<string>): Promise<StockParse> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  // use the sheet with the most rows (shops often keep a summary tab first)
  const sheetName = wb.SheetNames.reduce((best, n) => {
    const r = XLSX.utils.decode_range(wb.Sheets[n]["!ref"] ?? "A1");
    const b = XLSX.utils.decode_range(wb.Sheets[best]["!ref"] ?? "A1");
    return r.e.r > b.e.r ? n : best;
  }, wb.SheetNames[0]);
  const ws = wb.Sheets[sheetName];
  // the header may not be on row 1 — find the first row that names a serial column
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
  const headerAt = Math.max(0, grid.slice(0, 15).findIndex((r) => r.some((c) => (STOCK_ALIASES.serial as readonly string[]).includes(n2(String(c))))));
  const header = (grid[headerAt] ?? []).map((c) => String(c).trim());

  const columns: StockParse["columns"] = {};
  const used = new Set<number>();
  // earlier aliases win: "Service Tag" beats a loose "Tag", "Selling price" beats "Price"
  (Object.keys(STOCK_ALIASES) as StockKey[]).forEach((key) => {
    for (const alias of STOCK_ALIASES[key] as readonly string[]) {
      const i = header.findIndex((h, idx) => !used.has(idx) && n2(h) === alias);
      if (i >= 0) {
        columns[key] = header[i];
        used.add(i);
        break;
      }
    }
  });
  const ignored = header.filter((h, i) => h && !used.has(i));
  const col = (r: unknown[], key: StockKey) => {
    const name = columns[key];
    return name === undefined ? undefined : r[header.indexOf(name)];
  };

  const seen = new Set<string>();
  const rows: StockParse["rows"] = grid.slice(headerAt + 1).map((r, i) => {
    const row = headerAt + i + 2;
    const raw = Object.fromEntries(header.map((h, j) => [h || `Column ${j + 1}`, r[j]]));
    const serial = String(col(r, "serial") ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!serial) return { row, raw, error: "Serial number is missing" };
    if (seen.has(serial)) return { row, raw, error: "Same serial appears twice in this sheet" };
    if (existingSerials.has(serial)) return { row, raw, error: "Already in the app" };
    seen.add(serial);

    let brand = String(col(r, "brand") ?? "").trim();
    let model = String(col(r, "model") ?? "").trim();
    const lead = BRANDS.find((b) => model.toLowerCase().startsWith(b.toLowerCase() + " "));
    if (!brand && lead) brand = lead;
    if (lead && brand.toLowerCase() === lead.toLowerCase()) model = model.slice(lead.length).trim();
    brand = BRANDS.find((b) => b.toLowerCase() === brand.toLowerCase()) ?? brand;
    if (!brand || !model) return { row, raw, error: "Brand or model is missing" };

    const gradeRaw = String(col(r, "grade") ?? "").toUpperCase().match(/\b([ABC])\b|^([ABC])/);
    const grade = (gradeRaw?.[1] ?? gradeRaw?.[2]) as ImportRow["grade"] | undefined;
    const stage = readStatus(col(r, "status"), !!grade);
    if (stage === "sold") {
      seen.delete(serial);
      return { row, raw, skipped: "Marked sold — not stock any more" };
    }

    const cpuText = `${col(r, "cpu") ?? ""} ${columns.cpu ? "" : model}`;
    const cpu = readCpu(cpuText, col(r, "gen"));
    if (!cpu) return { row, raw, error: "Couldn't read the processor (e.g. i5-8350U)" };
    if (!cpu.gen) return { row, raw, error: "Processor generation is missing" };

    const ramText = String(col(r, "ram") ?? "");
    const ram = firstNum(ramText);
    const storageText = String(col(r, "storage") ?? "");
    let storage = firstNum(storageText);
    if (/tb/i.test(storageText) && storage < 10) storage = storage * 1000;
    if (!ram || !storage) return { row, raw, error: "RAM or storage is missing" };
    const typeText = `${col(r, "storageType") ?? ""} ${storageText}`.toLowerCase();
    const storageType: ImportRow["storageType"] = /hdd|hard/.test(typeText) && !/ssd/.test(typeText) ? "HDD" : /ssd|nvme|m\.2/.test(typeText) ? "SSD" : storage >= 500 && storage % 250 === 0 ? "HDD" : "SSD";

    const typeRaw = String(col(r, "type") ?? "").toLowerCase();
    const type = typeRaw.startsWith("d") || /desktop|cpu|tower|aio/.test(typeRaw) || (!typeRaw && DESKTOP_HINT.test(model)) ? "Desktop" : "Laptop";

    const locRaw = String(col(r, "location") ?? "").toLowerCase();
    const location = /godown|warehouse|store ?room|back/.test(locRaw) ? "Godown" : "Shop";
    const cost = firstNum(col(r, "cost"));
    const price = firstNum(col(r, "price"));
    const battery = firstNum(col(r, "battery"));

    return {
      row,
      raw,
      data: {
        serial,
        type,
        brand,
        model,
        cpu: cpu.cpu,
        gen: cpu.gen,
        ram,
        storage,
        storageType,
        screen: type === "Laptop" ? 14 : undefined,
        condition: "Used",
        stage,
        grade: grade ?? null,
        location,
        cost: Number.isFinite(cost) ? Math.round(cost) : 0,
        price: Number.isFinite(price) && price > 0 ? Math.round(price) : undefined,
        battery: Number.isFinite(battery) && battery > 0 && battery <= 100 ? Math.round(battery) : undefined,
        supplier: String(col(r, "supplier") ?? "").trim() || undefined,
        boughtOn: readDate(col(r, "date")),
      },
    };
  });
  return { rows, columns, ignored, sheetName };
}
