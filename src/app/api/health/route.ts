import { connection } from "next/server";
import { getDb } from "@/server/db";
import { loadSnapshot } from "@/server/repo";

/** Is the app able to load its data? Runs the same load as after login, returns only timings. */
export async function GET() {
  await connection();
  const t0 = Date.now();
  try {
    const db = await getDb();
    const t1 = Date.now();
    await loadSnapshot(db);
    return Response.json(
      { ok: true, connectMs: t1 - t0, loadMs: Date.now() - t1, engine: db.engine },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200), ms: Date.now() - t0 }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
