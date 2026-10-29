import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

import { MIGRATIONS } from '@/db/schema';

const NAME = 'app';
const web = Capacitor.getPlatform() === 'web';
const sqlite = new SQLiteConnection(CapacitorSQLite);
let conn: SQLiteDBConnection;

/** Opens the local database and applies pending migrations. Call once before rendering. */
export async function openDb() {
  if (web) {
    // In the browser (dev only) SQLite runs as wasm and persists to IndexedDB.
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    await defineCustomElements(window);
    document.body.appendChild(document.createElement('jeep-sqlite'));
    await customElements.whenDefined('jeep-sqlite');
    await sqlite.initWebStore();
  }
  // Reuse the connection across dev hot reloads.
  const exists = (await sqlite.checkConnectionsConsistency()).result && (await sqlite.isConnection(NAME, false)).result;
  conn = exists
    ? await sqlite.retrieveConnection(NAME, false)
    : await sqlite.createConnection(NAME, false, 'no-encryption', 1, false);
  await conn.open();

  const [{ user_version: version }] = await all<{ user_version: number }>('PRAGMA user_version');
  for (let v = version; v < MIGRATIONS.length; v++) {
    // Migration and its version bump commit together, so a crash can't leave it half-applied.
    await conn.execute(`${MIGRATIONS[v]}\nPRAGMA user_version = ${v + 1};`, true);
  }
  if (web) await sqlite.saveToStore(NAME);
}

export async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return ((await conn.query(sql, params)).values ?? []) as T[];
}

export async function first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(sql, params))[0];
}

/** Only call inside write(). */
export async function run(sql: string, params: unknown[] = []) {
  await conn.run(sql, params, false);
}

type Listener = (tables: string[]) => void;
const listeners = new Set<Listener>();

/** Notified after every write() with the tables it touched. */
export function onChange(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Runs fn in one transaction, then tells listeners which tables changed. */
export async function write(tables: string[], fn: () => Promise<void>) {
  await conn.beginTransaction();
  try {
    await fn();
    await conn.commitTransaction();
  } catch (e) {
    await conn.rollbackTransaction();
    throw e;
  }
  if (web) await sqlite.saveToStore(NAME);
  listeners.forEach((l) => l(tables));
}
