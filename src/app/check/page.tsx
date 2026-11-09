import { CheckView } from "./check-view";

export default async function CheckPage({ searchParams }: PageProps<"/check">) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" ? sp.m : undefined;
  return <CheckView key={m ?? ""} initialId={m} />;
}
