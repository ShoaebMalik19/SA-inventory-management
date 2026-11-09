import { OrdersView } from "./orders-view";
import type { Grade, MachineType, Requirement } from "@/lib/data/types";

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const prefill: Requirement | undefined = get("qty")
    ? {
        qty: +get("qty")!,
        type: (get("type") as MachineType) ?? "Laptop",
        cpu: get("cpu") ?? "Core i5",
        minGen: +(get("minGen") ?? 8),
        ram: +(get("ram") ?? 8),
        storage: +(get("storage") ?? 256),
        grade: (get("grade") as Grade) ?? "B",
      }
    : undefined;
  return <OrdersView key={JSON.stringify(prefill ?? {})} prefill={prefill} />;
}
