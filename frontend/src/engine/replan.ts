/**
 * FR-10 event-driven re-planning: decide which households an event displaces. Only affected
 * assignments change; everything else stays fixed and keeps consuming shelter capacity.
 */
import type { Facility, Severity } from "@/api/extensions";
import type { AssignmentStatus } from "@/api/schemas";

export interface ActiveAssignmentLite {
  assignment_id: number;
  zone_id: number;
  shelter_id: number;
  route_id: number | null;
  household_ids: string[];
  status: AssignmentStatus;
  severity: Severity;
  required: Facility[];
}

export type ReplanEvent =
  | { type: "RouteBlocked"; route_ids: number[]; label: string }
  | { type: "ShelterClosed"; shelter_id: number; label: string }
  | { type: "ShelterFull"; shelter_id: number; overflow: number; label: string }
  | { type: "FacilityLost"; shelter_id: number; facilities: Facility[]; label: string }
  | { type: "Regenerate"; label: string }
  /** Displaces nothing; only offers spare capacity to households that are still unallocated. */
  | { type: "RetryUnallocated"; label: string };

export interface Displacement {
  assignment_id: number;
  household_ids: string[];
  reason: string;
}

export const MOVABLE: AssignmentStatus[] = ["Scheduled", "In Progress"];

export function selectAffected(
  active: ActiveAssignmentLite[],
  event: ReplanEvent,
  householdSize: (id: string) => number,
): Displacement[] {
  const movable = active.filter((a) => MOVABLE.includes(a.status));
  switch (event.type) {
    case "RouteBlocked":
      return movable
        .filter((a) => a.route_id != null && event.route_ids.includes(a.route_id))
        .map((a) => ({ assignment_id: a.assignment_id, household_ids: a.household_ids, reason: event.label }));
    case "ShelterClosed":
      return movable
        .filter((a) => a.shelter_id === event.shelter_id)
        .map((a) => ({ assignment_id: a.assignment_id, household_ids: a.household_ids, reason: event.label }));
    case "FacilityLost":
      return movable
        .filter((a) => a.shelter_id === event.shelter_id && a.required.some((f) => event.facilities.includes(f)))
        .map((a) => ({ assignment_id: a.assignment_id, household_ids: a.household_ids, reason: event.label }));
    case "RetryUnallocated":
      return [];
    case "Regenerate":
      return movable
        .filter((a) => a.status === "Scheduled")
        .map((a) => ({ assignment_id: a.assignment_id, household_ids: a.household_ids, reason: event.label }));
    case "ShelterFull": {
      // Stability: displace groups that have not left yet before groups already en route,
      // and lower-severity zones before higher-severity ones.
      let overflow = event.overflow;
      if (overflow <= 0) return [];
      const candidates = movable
        .filter((a) => a.shelter_id === event.shelter_id)
        .sort(
          (a, b) =>
            Number(a.status === "In Progress") - Number(b.status === "In Progress") ||
            a.severity - b.severity ||
            a.required.length - b.required.length ||
            b.assignment_id - a.assignment_id,
        );
      const out: Displacement[] = [];
      for (const a of candidates) {
        if (overflow <= 0) break;
        const taken: string[] = [];
        for (const id of [...a.household_ids].sort((x, y) => householdSize(y) - householdSize(x))) {
          if (overflow <= 0) break;
          taken.push(id);
          overflow -= householdSize(id);
        }
        if (taken.length > 0) out.push({ assignment_id: a.assignment_id, household_ids: taken, reason: event.label });
      }
      return out;
    }
  }
}
