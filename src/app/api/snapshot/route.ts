import { connection } from "next/server";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { forRole, loadSnapshot } from "@/server/repo";

/** Everything the signed-in person is allowed to see. */
export async function GET() {
  await connection();
  const user = await currentUser();
  if (!user) return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    const db = await getDb();
    const data = forRole(await loadSnapshot(db), user.role);
    return Response.json({ user, data, engine: db.engine }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("snapshot failed", e);
    return Response.json({ error: "The database didn't answer. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
