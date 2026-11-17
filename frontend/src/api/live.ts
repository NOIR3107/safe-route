/**
 * Live connection to the server.
 *
 * The TanStack Query cache is the app's one data store; it is filled from REST. This WebSocket only
 * says *what changed*, and the matching queries are fetched again. A heartbeat arrives every second,
 * which is how the UI knows whether it is looking at live numbers:
 *
 *   connecting    first connection not open yet
 *   live          heartbeat within the last 5 s
 *   stale         socket open but no heartbeat for 5 s (server busy or network trouble)
 *   disconnected  socket closed; reconnecting with backoff, data shown is the last known
 */
import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { WS_URL } from "./client";
import { ClockSchema, type Clock } from "./viewSchemas";

export type ConnectionStatus = "connecting" | "live" | "stale" | "disconnected";

export const STALE_AFTER_MS = 5_000;

interface LiveState {
  status: ConnectionStatus;
  lastMessageAt: number | null;
  clock: Clock | null;
  reconnectInAt: number | null;
  set: (patch: Partial<Omit<LiveState, "set">>) => void;
}

export const useLive = create<LiveState>((set) => ({
  status: "connecting",
  lastMessageAt: null,
  clock: null,
  reconnectInAt: null,
  set: (patch) => set(patch),
}));

/** Queries that never change because of server events (or are per-search). */
const NOT_LIVE = new Set(["scenarios", "public", "reunify", "compare"]);

type ServerMessage =
  | { type: "hello"; clock: unknown }
  | { type: "tick" }
  | { type: "changed"; topics: string[]; mode: string };

/** Pure helper (unit tested): which query keys a "changed" message should refetch. */
export function shouldRefetch(queryKey0: unknown, topics: string[]): boolean {
  if (typeof queryKey0 !== "string" || NOT_LIVE.has(queryKey0)) return false;
  return topics.includes("*") || topics.includes(queryKey0);
}

/** Pure helper (unit tested): status from the time since the last message. */
export function statusFor(socketOpen: boolean, lastMessageAt: number | null, now: number): ConnectionStatus {
  if (!socketOpen) return lastMessageAt == null ? "connecting" : "disconnected";
  if (lastMessageAt == null) return "connecting";
  return now - lastMessageAt > STALE_AFTER_MS ? "stale" : "live";
}

export function startLiveConnection(qc: QueryClient): () => void {
  let ws: WebSocket | null = null;
  let open = false;
  let stopped = false;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTopics = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const store = useLive.getState();

  const refetch = (topics: string[]) => {
    topics.forEach((t) => pendingTopics.add(t));
    if (flushTimer) return;
    // Batch bursts (a running drill changes data every second) into one refetch.
    flushTimer = setTimeout(() => {
      const t = [...pendingTopics];
      pendingTopics = new Set();
      flushTimer = null;
      void qc.invalidateQueries({ predicate: (q) => shouldRefetch(q.queryKey[0], t) });
    }, 250);
  };

  const setClock = (raw: unknown) => {
    const parsed = ClockSchema.safeParse(raw);
    if (!parsed.success) return;
    const before = useLive.getState().clock;
    store.set({ clock: parsed.data });
    // Switching between live and drill data changes every number on screen.
    if (before && before.mode !== parsed.data.mode) refetch(["*", "drill", "clock"]);
  };

  const connect = () => {
    if (stopped) return;
    store.set({ status: useLive.getState().lastMessageAt == null ? "connecting" : "disconnected", reconnectInAt: null });
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      open = true;
      retries = 0;
      refetch(["*"]); // catch up on anything missed while disconnected
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      store.set({ lastMessageAt: Date.now(), status: "live" });
      if (msg.type === "hello") setClock(msg.clock);
      else if (msg.type === "tick") setClock(msg);
      else if (msg.type === "changed") refetch([...msg.topics, "clock", "drill"]);
    };
    ws.onclose = () => {
      open = false;
      ws = null;
      if (stopped) return;
      const delay = Math.min(30_000, 1_000 * 2 ** retries);
      retries += 1;
      store.set({ status: "disconnected", reconnectInAt: Date.now() + delay });
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => ws?.close();
  };

  const watchdog = setInterval(() => {
    const { lastMessageAt, status } = useLive.getState();
    const next = statusFor(open, lastMessageAt, Date.now());
    if (next !== status) store.set({ status: next });
  }, 1_000);

  connect();
  return () => {
    stopped = true;
    clearInterval(watchdog);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (flushTimer) clearTimeout(flushTimer);
    ws?.close();
  };
}
