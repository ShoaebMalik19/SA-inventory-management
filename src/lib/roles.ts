import type { Role } from "./data/types";

/** What each role is allowed to do. Checked on the server for every change, and used to shape the menu. */
export const PERMISSIONS = {
  viewMoney: ["owner", "manager"],
  addStock: ["owner", "manager", "technician"],
  check: ["owner", "manager", "technician"],
  orders: ["owner", "manager"],
  sell: ["owner", "manager", "counter"],
  returns: ["owner", "manager", "counter"],
  move: ["owner", "manager", "technician", "counter"],
  billing: ["owner", "manager"],
  settings: ["owner"],
  staff: ["owner"],
  reset: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role | undefined, p: Permission) => !!role && (PERMISSIONS[p] as readonly Role[]).includes(role);

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  technician: "Technician",
  counter: "Counter sales",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including money, invoices, staff and settings",
  manager: "Everything except staff and settings, including invoices and payments",
  technician: "Add stock, check & grade, move machines, print labels",
  counter: "Shop sales and bills, returns, look up stock",
};

/** Pages each role can open. Home for technician/counter is their main job screen. */
export const PAGE_ACCESS: Record<string, readonly Role[]> = {
  "/": ["owner", "manager"],
  "/machines": ["owner", "manager", "technician", "counter"],
  "/stock": ["owner", "manager", "technician", "counter"],
  "/check": PERMISSIONS.check,
  "/add": PERMISSIONS.addStock,
  "/orders": PERMISSIONS.orders,
  "/sale": PERMISSIONS.sell,
  "/returns": PERMISSIONS.returns,
  "/batches": PERMISSIONS.viewMoney,
  "/labels": ["owner", "manager", "technician", "counter"],
  "/staff": PERMISSIONS.staff,
  "/invoices": ["owner", "manager", "counter"],
  "/money": PERMISSIONS.billing,
  "/settings": PERMISSIONS.settings,
};

export const HOME_FOR: Record<Role, string> = {
  owner: "/",
  manager: "/",
  technician: "/check",
  counter: "/sale",
};

export function canOpen(role: Role, pathname: string) {
  const key = Object.keys(PAGE_ACCESS)
    .filter((k) => (k === "/" ? pathname === "/" : pathname.startsWith(k)))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PAGE_ACCESS[key].includes(role) : true;
}
