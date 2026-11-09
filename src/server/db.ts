import "server-only";
import { SCHEMA_SQL } from "./schema";

/**
 * One tiny database interface for two engines:
 *  - DATABASE_URL set  → real Postgres (Supabase, Neon, any host) via postgres.js
 *  - not set           → embedded Postgres (PGlite) stored in ./.data — zero setup on a laptop
 * Everything above this file only uses `query` and `tx`.
 */
export type Q = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};
export type Db = Q & { tx<R>(fn: (q: Q) => Promise<R>): Promise<R>; engine: "postgres" | "embedded" };

type G = { __saDb?: Promise<Db> };
const g = globalThis as G;

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false keeps it working behind Supabase's connection pooler
    const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
    type Unsafe = { unsafe: (text: string, params?: never[]) => PromiseLike<unknown> };
    const wrap = (s: Unsafe): Q => ({
      query: async (text, params = []) => (await s.unsafe(text, params as never[])) as never,
    });
    return {
      engine: "postgres",
      ...wrap(sql as unknown as Unsafe),
      tx: (fn) => sql.begin((t) => fn(wrap(t as unknown as Unsafe))) as never,
    };
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. On Vercel the app needs a real Postgres database (e.g. Supabase). See README → Go live.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.EMBEDDED_DB_DIR ?? `${process.cwd()}/.data/pg`;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  // PGlite runs one thing at a time; a queue keeps transactions from overlapping
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <R>(job: () => Promise<R>) => {
    const next = chain.then(job, job);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    engine: "embedded",
    query: (text, params) => serial(async () => (await pg.query(text, params)).rows as never),
    tx: (fn) =>
      serial(() =>
        pg.transaction((t) =>
          fn({ query: async (text, params) => (await t.query(text, params)).rows as never }),
        ),
      ),
  };
}

export function getDb(): Promise<Db> {
  if (!g.__saDb) {
    g.__saDb = (async () => {
      const db = await connect();
      await db.query("select 1");
      for (const stmt of SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        await db.query(stmt);
      }
      const { ensureSeeded } = await import("./seed-db");
      await ensureSeeded(db);
      return db;
    })().catch((e) => {
      g.__saDb = undefined;
      throw e;
    });
  }
  return g.__saDb;
}
