import { del, get, set } from "idb-keyval";
import { SCHEMA_VERSION, type DbState } from "./state";

const KEY = "saferoute-mock-db";
let timer: ReturnType<typeof setTimeout> | null = null;

const hasIdb = () => typeof indexedDB !== "undefined";

export async function loadState(): Promise<DbState | null> {
  if (!hasIdb()) return null;
  try {
    const raw = await get<DbState>(KEY);
    return raw && raw.schema_version === SCHEMA_VERSION ? raw : null;
  } catch {
    return null;
  }
}

/** Debounced write so a running drill does not hammer IndexedDB. */
export function saveState(db: DbState): void {
  if (!hasIdb()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    set(KEY, db).catch(() => undefined);
  }, 400);
}

export async function clearState(): Promise<void> {
  if (!hasIdb()) return;
  await del(KEY).catch(() => undefined);
}
