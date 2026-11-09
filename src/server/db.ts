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
export type Db = Q & { tx<R>(fn: (q: Q) => Promise<R>): Promise<R>; engine: "postgres" | "embedded"; close?: () => Promise<void> };

/**
 * Supabase's transaction pooler (port 6543) can mix up the replies to queries that run side by side
 * ("server sent a message with an invalid length"), after which the connection hangs.
 * Its session pooler (port 5432, same host) keeps one real connection per client and doesn't.
 */
function sessionPoolerUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") u.port = "5432";
    return u.toString();
  } catch {
    return url;
  }
}

export class DbTimeout extends Error {}

/**
 * Never wait forever on the database. If a query hangs, drop the whole connection pool
 * so the next request starts with fresh connections instead of queueing behind a dead one.
 */
function limit<R>(p: Promise<R>, what: string, ms = 20_000): Promise<R> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.error(`Database did not answer in ${ms / 1000}s (${what.slice(0, 60)}); reconnecting`);
      void resetDb();
      reject(new DbTimeout("The database took too long to answer. Please try again."));
    }, ms);
  });
  const watched = p.catch((e: { code?: string }) => {
    // a broken connection never heals by itself — start over on the next request
    if (/^(CONNECTION_|PROTOCOL_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE)/.test(String(e?.code ?? ""))) void resetDb();
    throw e;
  });
  return Promise.race([watched, timeout]).finally(() => clearTimeout(timer)) as Promise<R>;
}

async function resetDb() {
  const pending = g.__saDb;
  g.__saDb = undefined;
  const db = await pending?.catch(() => undefined);
  await db?.close?.().catch(() => undefined);
}

type G = { __saDb?: Promise<Db> };
const g = globalThis as G;

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(sessionPoolerUrl(url), {
      prepare: false, // works behind any Supabase pooler
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 10,
    });
    type Unsafe = { unsafe: (text: string, params?: never[]) => PromiseLike<unknown> };
    const wrap = (s: Unsafe): Q => ({
      query: (text, params = []) => limit(Promise.resolve(s.unsafe(text, params as never[])) as never, text),
    });
    return {
      engine: "postgres",
      ...wrap(sql as unknown as Unsafe),
      tx: (fn) => limit(Promise.resolve(sql.begin((t) => fn(wrap(t as unknown as Unsafe)))) as never, "transaction", 45_000),
      close: () => sql.end({ timeout: 0 }),
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
      const { ensureBilling } = await import("./billing");
      await ensureBilling(db);
      const { ensureSuppliers } = await import("./suppliers");
      await ensureSuppliers(db);
      return db;
    })().catch((e) => {
      g.__saDb = undefined;
      throw e;
    });
  }
  return g.__saDb;
}
