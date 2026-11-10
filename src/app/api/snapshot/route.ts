import { after, connection } from "next/server";
import { lastBackupAt, makeBackup } from "@/server/backups";
import { verifyPin } from "@/server/pin";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { forRole, loadSnapshot } from "@/server/repo";

const weakCache = new Map<string, boolean>();

/** Everything the signed-in person is allowed to see. */
export async function GET() {
  await connection();
  const user = await currentUser();
  if (!user) return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    const db = await getDb();
    const data = forRole(await loadSnapshot(db), user.role);
    const lastBackup = await lastBackupAt(db).catch(() => undefined);
    // tell the owner if anyone can still sign in with an easy starting PIN
    let weakPins: string[] | undefined;
    if (user.role === "owner") {
      const easy = ["1111", "2222", "3333", "4444", "0000", "1234"];
      const rows = await db.query<{ name: string; pin_hash: string }>("select name, pin_hash from staff where active");
      weakPins = rows
        .filter((r) => {
          // checking a PIN is slow on purpose, so remember the answer for each stored PIN
          if (!weakCache.has(r.pin_hash)) weakCache.set(r.pin_hash, easy.some((p) => verifyPin(p, r.pin_hash)));
          return weakCache.get(r.pin_hash);
        })
        .map((r) => r.name);
    }
    // safety net if the nightly job was missed: make the day's copy after answering
    if (!lastBackup || Date.now() - new Date(lastBackup).getTime() > 26 * 3_600_000)
      after(async () => {
        const last = await lastBackupAt(db, "auto");
        if (!last || Date.now() - new Date(last).getTime() > 26 * 3_600_000) await db.tx((q) => makeBackup(q, "auto", "Daily backup"));
      });
    return Response.json({ user, data: { ...data, lastBackup: user.role === "owner" ? lastBackup : undefined, weakPins }, engine: db.engine }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("snapshot failed", e);
    return Response.json({ error: "The database didn't answer. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
