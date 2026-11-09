import { connection } from "next/server";
import { getDb } from "@/server/db";

/** Names and roles for the login screen (never PINs). Always read live, never pre-built. */
export async function GET() {
  await connection();
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; role: string }>(
    "select id, name, role from staff where active order by case role when 'owner' then 0 when 'manager' then 1 when 'technician' then 2 else 3 end, name",
  );
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
