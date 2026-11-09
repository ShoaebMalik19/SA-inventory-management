import { SaleView } from "./sale-view";

export default async function SalePage({ searchParams }: PageProps<"/sale">) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" ? sp.m : undefined;
  return <SaleView key={m ?? ""} initialId={m} />;
}
