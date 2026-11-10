import { connection } from "next/server";
import { getDb } from "@/server/db";
import { lastBackupAt, makeBackup } from "@/server/backups";

/**
 * Nightly backup. Vercel calls this once a day (see vercel.json).
 * If CRON_SECRET is set, only Vercel's call is accepted. Either way it never makes more than one automatic copy in 20 hours.
 */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const db = await getDb();
  const last = await lastBackupAt(db, "auto");
  if (last && Date.now() - new Date(last).getTime() < 20 * 3_600_000) return Response.json({ ok: true, skipped: true, last });
  const info = await db.tx((q) => makeBackup(q, "auto", "Nightly backup"));
  return Response.json({ ok: true, info: { at: info.at, size: info.size, rows: info.rows } });
}
