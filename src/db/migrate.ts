import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from '@/db/schema';

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    // Migration and its version bump commit together, so a crash can't leave it half-applied.
    await db.withTransactionAsync(() =>
      db.execAsync(`${MIGRATIONS[v]}\nPRAGMA user_version = ${v + 1};`),
    );
  }
}
