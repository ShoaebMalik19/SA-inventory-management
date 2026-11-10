import { connection } from "next/server";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { makeBackup, readBackupFile, restoreAll } from "@/server/backups";
import { activity } from "@/server/service";
import { can } from "@/lib/roles";

/** Restore from a backup file the owner uploads (e.g. one kept on a laptop). Owner only, all-or-nothing. */
export async function POST(req: Request) {
  await connection();
  const user = await currentUser();
  if (!user || !can(user.role, "backup")) return Response.json({ ok: false, error: "Only the owner can restore." }, { status: 403 });
  if (req.headers.get("x-confirm") !== "RESTORE") return Response.json({ ok: false, error: "Type RESTORE to confirm." }, { status: 400 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > 4_000_000) return Response.json({ ok: false, error: "This file is too big to be one of our backups." }, { status: 400 });
  let file;
  try {
    file = readBackupFile(bytes);
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
  try {
    const db = await getDb();
    const rows = await db.tx(async (q) => {
      await makeBackup(q, "before-restore", user.name);
      const n = await restoreAll(q, file);
      await activity(q, `Restored a backup file from ${new Date(file.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, "backup", user, `${n.toLocaleString("en-IN")} records. A copy of what was there just before is kept.`);
      return n;
    });
    return Response.json({ ok: true, rows });
  } catch (e) {
    console.error("restore failed", e);
    return Response.json({ ok: false, error: "The restore failed and nothing was changed. Try again." }, { status: 500 });
  }
}
