"use client";

import * as XLSX from "xlsx";
import { CATALOG } from "./seed";
import type { MachineType } from "./types";
import type { NewMachineInput } from "./store";

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
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
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
