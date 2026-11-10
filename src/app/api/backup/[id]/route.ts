import { connection } from "next/server";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { backupBytes } from "@/server/backups";
import { can } from "@/lib/roles";

/** Download one saved backup as a file the owner can keep (owner only). */
export async function GET(_: Request, ctx: RouteContext<"/api/backup/[id]">) {
  await connection();
  const user = await currentUser();
  if (!user || !can(user.role, "backup")) return new Response("Only the owner can download backups.", { status: 403 });
  const { id } = await ctx.params;
  const db = await getDb();
  const b = await backupBytes(db, id);
  if (!b) return new Response("Not found", { status: 404 });
  const stamp = new Date(b.at).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(/[: ]/g, "-").slice(0, 16);
  return new Response(new Uint8Array(b.data), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="sa-computers-backup-${stamp}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
