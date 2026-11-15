/**
 * Offline-first sync queue for the Field Team view. Actions taken offline are stored (localStorage)
 * and replayed in order when connectivity returns. Optimistic state is derived from the queue.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type QueuedAction =
  | { kind: "pickup"; assignment_id: number; household_ids: string[] }
  | { kind: "arrived"; assignment_id: number };

export interface QueueItem {
  id: string;
  created_at: string;
  action: QueuedAction;
  attempts: number;
  error: string | null;
}

interface SyncState {
  items: QueueItem[];
  lastSyncedAt: string | null;
  syncing: boolean;
  enqueue: (action: QueuedAction) => void;
  remove: (id: string) => void;
  markFailed: (id: string, error: string) => void;
  setSyncing: (v: boolean) => void;
  setSynced: () => void;
}

export const useSyncQueue = create<SyncState>()(
  persist(
    (set) => ({
      items: [],
      lastSyncedAt: null,
      syncing: false,
      enqueue: (action) =>
        set((s) => ({
          items: [...s.items, { id: crypto.randomUUID(), created_at: new Date().toISOString(), action, attempts: 0, error: null }],
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      markFailed: (id, error) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1, error } : i)) })),
      setSyncing: (syncing) => set({ syncing }),
      setSynced: () => set({ lastSyncedAt: new Date().toISOString() }),
    }),
    { name: "saferoute-field-sync", partialize: (s) => ({ items: s.items, lastSyncedAt: s.lastSyncedAt }) },
  ),
);

/** Household ids the team has picked up offline but not yet synced. */
export function pendingPickups(items: QueueItem[], assignmentId: number): Set<string> {
  return new Set(
    items.flatMap((i) => (i.action.kind === "pickup" && i.action.assignment_id === assignmentId ? i.action.household_ids : [])),
  );
}

export function pendingArrival(items: QueueItem[], assignmentId: number): boolean {
  return items.some((i) => i.action.kind === "arrived" && i.action.assignment_id === assignmentId);
}
