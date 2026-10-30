import { useEffect, useState } from 'react';

import { onChange } from '@/db/db';

/** Runs `load` and re-runs it whenever a write touches one of `tables` or `deps` change. undefined while loading. */
export function useLive<T>(load: () => Promise<T>, tables: string[], deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  const key = tables.join(',');
  useEffect(() => {
    let alive = true;
    const reload = () => load().then((v) => alive && setValue(() => v));
    reload();
    const off = onChange((changed) => changed.some((t) => tables.includes(t)) && reload());
    return () => {
      alive = false;
      off();
    };
    // Keyed on the table list + deps: callers pass a new load function every render.
  }, [key, ...deps]);
  return value;
}
