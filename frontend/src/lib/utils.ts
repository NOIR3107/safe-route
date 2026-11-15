import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-IN");
}

export function fmtPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtMinutes(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  const v = Math.round(m);
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60);
  const r = v % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function fmtSim(minute: number): string {
  return `T+${Math.round(minute)}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function signed(n: number, unit = ""): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}${unit}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
