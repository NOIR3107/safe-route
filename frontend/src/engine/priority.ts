/**
 * FR-06 priority score, a 1:1 port of `app/engines/priority_engine.py` so the frontend engine ranks
 * zones exactly like the FastAPI backend does.
 */
import type { DisasterSeverity } from "@/api/schemas";
import type { EngineZone } from "./model";

export const SEVERITY_WEIGHTS: Record<string, number> = { CRITICAL: 1.0, HIGH: 0.8, MEDIUM: 0.5, LOW: 0.3 };
export const RISK_WEIGHTS: Record<string, number> = { EXTREME: 1.0, HIGH: 0.8, MODERATE: 0.5, LOW: 0.2 };
export const PRIORITY_LEVEL_WEIGHTS: Record<string, number> = { P1: 1.0, P2: 0.75, P3: 0.5, P4: 0.25 };

export function zonePriorityScore(
  zone: Pick<EngineZone, "population" | "evacuated_count" | "risk_level" | "priority">,
  disasterSeverity: DisasterSeverity,
): number {
  const remaining = Math.max(0, zone.population - zone.evacuated_count);
  if (remaining <= 0) return 0;
  const sev = SEVERITY_WEIGHTS[disasterSeverity.toUpperCase()] ?? 0.5;
  const risk = RISK_WEIGHTS[zone.risk_level.toUpperCase()] ?? 0.5;
  const priCode = zone.priority.split("-")[0]!.trim().toUpperCase();
  const pri = PRIORITY_LEVEL_WEIGHTS[priCode] ?? 0.5;
  const pop = Math.min(1, remaining / 1000);
  const score = 0.35 * risk + 0.3 * pri + 0.2 * sev + 0.15 * pop;
  return Math.round(score * 10000) / 10000;
}
