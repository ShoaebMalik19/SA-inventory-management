/**
 * GST maths for used laptops and desktops (HSN 8471).
 * All selling prices in the app INCLUDE GST, the way shops quote them.
 *
 * Two schemes:
 *  - margin: Rule 32(5) CGST Rules, for second-hand goods dealers who don't take input tax credit.
 *            GST is paid only on (selling price − purchase price) per item; a negative margin counts as zero.
 *            Repairs and upgrades are not deducted (they add value), so the margin uses the purchase price only.
 *  - normal: GST on the full selling price.
 * Same state as the shop → CGST + SGST (half each). Other state → IGST.
 * The business should confirm its scheme with its CA; the owner picks it in Settings.
 */

export type GstScheme = "margin" | "normal";

export const HSN_COMPUTERS = "8471";

export const STATES: { name: string; code: string }[] = [
  { name: "Karnataka", code: "29" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Kerala", code: "32" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Telangana", code: "36" },
  { name: "Maharashtra", code: "27" },
  { name: "Goa", code: "30" },
  { name: "Gujarat", code: "24" },
  { name: "Delhi", code: "07" },
  { name: "Haryana", code: "06" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Rajasthan", code: "08" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "West Bengal", code: "19" },
  { name: "Punjab", code: "03" },
  { name: "Odisha", code: "21" },
  { name: "Bihar", code: "10" },
];

export const stateCode = (name: string) => STATES.find((s) => s.name === name)?.code ?? "";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Indian financial year label for a date: Nov 2026 → "26-27", Feb 2027 → "26-27". */
export function financialYear(d: Date) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export type TaxLine = { amount: number; purchase?: number };

export function computeTax(lines: TaxLine[], scheme: GstScheme, ratePct: number, intra: boolean) {
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  const base =
    scheme === "margin" ? lines.reduce((s, l) => s + Math.max(0, l.amount - (l.purchase ?? 0)), 0) : total;
  // prices include tax: base = taxable + tax
  const taxable = r2((base * 100) / (100 + ratePct));
  const tax = r2(base - taxable);
  const half = r2(tax / 2);
  return {
    total,
    marginValue: scheme === "margin" ? r2(base) : undefined,
    taxable,
    cgst: intra ? half : 0,
    sgst: intra ? r2(tax - half) : 0,
    igst: intra ? 0 : tax,
    tax,
  };
}

/** Amount in words, Indian system: 1,23,456 → "One lakh twenty-three thousand four hundred fifty-six" */
export function rupeesInWords(n: number) {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? `-${ones[x % 10]}` : ""}`);
  const three = (x: number) =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x);
  let rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero rupees only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5);
  rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3);
  rupees %= 1e3;
  if (crore) parts.push(`${three(crore)} crore`);
  if (lakh) parts.push(`${two(lakh)} lakh`);
  if (thousand) parts.push(`${two(thousand)} thousand`);
  if (rupees) parts.push(three(rupees));
  let out = parts.join(" ");
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return `${out} rupees${paise ? ` and ${two(paise)} paise` : ""} only`;
}
