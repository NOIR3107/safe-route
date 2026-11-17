/**
 * The planner's per-person route cost (backend/app/engine/cost.py, route_cost) with the default
 * weights from backend/app/engine/config.py, for the landing page's interactive explainer.
 * Pets and plan-stability terms are left out: they need a previous plan to mean anything.
 */
export type RoadStatus = "Open" | "Cleared" | "Congested" | "Flooded";
export type RouteRisk = "Low" | "Moderate" | "High" | "Severe";

export const SEVERITY_WEIGHT: Record<number, number> = { 1: 1.0, 2: 1.25, 3: 1.5, 4: 2.0, 5: 2.5 };
export const CONGESTION: Record<Exclude<RoadStatus, "Flooded">, number> = { Open: 1.0, Cleared: 1.15, Congested: 1.6 };
export const RISK_PENALTY: Record<RouteRisk, number> = { Low: 0, Moderate: 4, High: 10, Severe: 20 };
export const SOFT_FACILITIES = ["Power", "Water", "Food"] as const;
export const SOFT_FACILITY_PENALTY = 8;
export const UTILIZATION_PENALTY = 6;

export interface CostInput {
  travelMin: number;
  status: RoadStatus;
  severity: 1 | 2 | 3 | 4 | 5;
  risk: RouteRisk;
  missing: (typeof SOFT_FACILITIES)[number][];
  overNinety: boolean;
}

export interface CostTerm {
  key: "travel" | "risk" | "facility" | "utilization";
  label: string;
  value: number;
  note: string;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** null when the road fails the hard constraint (flooded roads are never used). */
export function routeCost(i: CostInput): { total: number; terms: CostTerm[] } | null {
  if (i.status === "Flooded") return null;
  const congestion = CONGESTION[i.status];
  const sev = SEVERITY_WEIGHT[i.severity]!;
  const terms: CostTerm[] = [
    {
      key: "travel",
      label: "Travel",
      value: round1(i.travelMin * congestion * sev),
      note: `${i.travelMin} min × ${congestion.toFixed(2)} (${i.status}) × ${sev} (severity ${i.severity})`,
    },
  ];
  const risk = RISK_PENALTY[i.risk];
  if (risk > 0) terms.push({ key: "risk", label: "Route risk", value: risk, note: `${i.risk} route risk +${risk}` });
  const facility = i.missing.length * SOFT_FACILITY_PENALTY;
  if (facility > 0) terms.push({ key: "facility", label: "Facilities", value: facility, note: i.missing.map((f) => `No ${f.toLowerCase()} +${SOFT_FACILITY_PENALTY}`).join(", ") });
  if (i.overNinety) terms.push({ key: "utilization", label: "Crowding", value: UTILIZATION_PENALTY, note: `Would push shelter above 90% +${UTILIZATION_PENALTY}` });
  return { total: round1(terms.reduce((s, t) => s + t.value, 0)), terms };
}
