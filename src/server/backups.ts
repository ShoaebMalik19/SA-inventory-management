import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Q } from "./db";
import { TABLES_IN_DELETE_ORDER } from "./schema";
import { uid } from "./service";
import type { BackupInfo } from "@/lib/data/types";

/**
 * A backup is every table as JSON, gzipped, stored in the `backups` table.
 * The same file can be downloaded, kept on a laptop or pen drive, and uploaded again to restore.
 */

const TABLES = ["settings", "staff", ...[...TABLES_IN_DELETE_ORDER].reverse()];
const SEQUENCES = ["batch_code_seq", "order_code_seq", "sale_code_seq", "return_code_seq"];
const KEEP: Record<BackupInfo["kind"], number> = { auto: 30, manual: 15, "before-restore": 5 };

export type BackupFile = {
  app: "sa-computers-stock";
  version: 1;
  at: string;
  tables: Record<string, Record<string, unknown>[]>;
  sequences: Record<string, number>;
};

export async function dumpAll(q: Q): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  for (const t of TABLES) {
    // the login-signing key stays with this database; it never goes into a file
    const where = t === "settings" ? " where key <> 'session_secret'" : "";
    const r = await q.query<{ rows: unknown }>(`select coalesce(json_agg(x), '[]'::json) as rows from ${t} x${where}`);
    const v = r[0].rows;
    tables[t] = (typeof v === "string" ? JSON.parse(v) : v) as Record<string, unknown>[];
  }
  const sequences: Record<string, number> = {};
  for (const s of SEQUENCES) {
    const r = await q.query<{ v: string | number }>(`select last_value as v from ${s}`);
    sequences[s] = Number(r[0].v);
  }
  return { app: "sa-computers-stock", version: 1, at: new Date().toISOString(), tables, sequences };
}

const rowCount = (f: BackupFile) => Object.values(f.tables).reduce((s, t) => s + t.length, 0);

export async function makeBackup(q: Q, kind: BackupInfo["kind"], byName?: string): Promise<BackupInfo> {
  const file = await dumpAll(q);
  const data = gzipSync(Buffer.from(JSON.stringify(file)));
  const id = uid("bk");
  const rows = rowCount(file);
  await q.query("insert into backups (id, at, kind, by_name, size, row_count, data) values ($1, now(), $2, $3, $4, $5, $6)", [
    id,
    kind,
    byName ?? null,
    data.length,
    rows,
    data,
  ]);
  // keep the newest few of each kind
  await q.query(
    "delete from backups where kind=$1 and id not in (select id from backups where kind=$1 order by at desc limit $2)",
    [kind, KEEP[kind]],
  );
  return { id, at: file.at, kind, by: byName, size: data.length, rows };
}

export async function listBackups(q: Q): Promise<BackupInfo[]> {
  const rows = await q.query<Record<string, unknown>>("select id, at, kind, by_name, size, row_count from backups order by at desc limit 60");
  return rows.map((r) => ({
    id: r.id as string,
    at: r.at instanceof Date ? r.at.toISOString() : new Date(String(r.at)).toISOString(),
    kind: r.kind as BackupInfo["kind"],
    by: (r.by_name as string) ?? undefined,
    size: Number(r.size),
    rows: Number(r.row_count),
  }));
}

export async function lastBackupAt(q: Q, kind?: BackupInfo["kind"]): Promise<string | undefined> {
  const r = await q.query<{ at: unknown }>(
    kind ? "select max(at) as at from backups where kind=$1" : "select max(at) as at from backups",
    kind ? [kind] : [],
  );
  const v = r[0]?.at;
  return v ? (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()) : undefined;
}

export async function backupBytes(q: Q, id: string): Promise<{ data: Buffer; at: string } | null> {
  const r = await q.query<{ data: Uint8Array; at: unknown }>("select data, at from backups where id=$1", [id]);
  if (!r[0]) return null;
  const at = r[0].at instanceof Date ? r[0].at.toISOString() : new Date(String(r[0].at)).toISOString();
  return { data: Buffer.from(r[0].data), at };
}

/** Read a downloaded file back (gzipped or plain JSON) and check it really is one of ours. */
export function readBackupFile(bytes: Uint8Array): BackupFile {
  let text: string;
  try {
    text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString("utf8") : Buffer.from(bytes).toString("utf8");
  } catch {
    throw new Error("This file is damaged and can't be read.");
  }
  let f: BackupFile;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error("This isn't a backup file from this app.");
  }
  if (f?.app !== "sa-computers-stock" || !f.tables || !Array.isArray(f.tables.machines) || !Array.isArray(f.tables.staff))
    throw new Error("This isn't a backup file from this app.");
  if (!f.tables.staff.some((s) => s.role === "owner" && s.active)) throw new Error("This backup has no active owner, so nobody could sign in. Not restored.");
  return f;
}

/** Replace everything with the backup. Runs inside the caller's transaction, so it is all-or-nothing. */
export async function restoreAll(q: Q, f: BackupFile) {
  const secret = await q.query<{ value: string }>("select value from settings where key='session_secret'");
  for (const t of [...TABLES].reverse()) await q.query(`delete from ${t}`);
  for (const t of TABLES) {
    const rows = f.tables[t] ?? [];
    for (let i = 0; i < rows.length; i += 2000) {
      await q.query(`insert into ${t} select * from json_populate_recordset(null::${t}, $1::json)`, [JSON.stringify(rows.slice(i, i + 2000))]);
    }
  }
  if (secret[0]) {
    await q.query("delete from settings where key='session_secret'");
    await q.query("insert into settings (key, value) values ('session_secret', $1)", [secret[0].value]);
  }
  for (const s of SEQUENCES) if (f.sequences?.[s]) await q.query(`select setval('${s}', $1)`, [f.sequences[s]]);
  // history lines number themselves; carry on after the highest restored number
  await q.query("select setval(pg_get_serial_sequence('machine_events','id'), coalesce((select max(id) from machine_events), 0) + 1, false)");
  return rowCount(f);
}
