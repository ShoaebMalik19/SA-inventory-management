import { MachinesView } from "./machines-view";
import type { Stage } from "@/lib/data/types";

export default async function MachinesPage({ searchParams }: PageProps<"/machines">) {
  const sp = await searchParams;
  const stage = typeof sp.stage === "string" ? (sp.stage as Stage) : undefined;
  return <MachinesView key={`${stage ?? ""}-${sp.old ?? ""}`} initialStage={stage} initialOld={sp.old === "1"} />;
}
