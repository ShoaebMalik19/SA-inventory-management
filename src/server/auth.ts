import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { Staff } from "@/lib/data/types";
import { can, type Permission } from "@/lib/roles";

const COOKIE = "sa_session";
const DAYS = 14;

async function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const db = await getDb();
  const rows = await db.query<{ value: string }>("select value from settings where key = 'session_secret'");
  return rows[0].value;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export async function startSession(staffId: string) {
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = `${staffId}.${exp}`;
  const token = `${payload}.${sign(payload, await secret())}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in staff member, or null. Checks the signature, expiry and that the account is still active. */
export async function currentUser(): Promise<Staff | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || +exp < Date.now()) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`, await secret()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; role: Staff["role"]; active: boolean }>(
    "select id, name, role, active from staff where id = $1",
    [id],
  );
  const s = rows[0];
  return s && s.active ? { id: s.id, name: s.name, role: s.role, active: s.active } : null;
}

export class NotAllowed extends Error {}

export async function requireUser(permission?: Permission) {
  const user = await currentUser();
  if (!user) throw new NotAllowed("Your session has ended. Please log in again.");
  if (permission && !can(user.role, permission)) throw new NotAllowed("Your role can't do this. Ask the owner.");
  return user;
}
