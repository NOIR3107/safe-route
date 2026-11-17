/** Legal status transitions. The UI only offers these; the backend rejects anything else (409). */
import type { RouteStatus, ShelterStatus } from "@/api/schemas";

export const ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  Open: ["Congested", "Blocked"],
  Congested: ["Open", "Blocked"],
  Blocked: ["Cleared"],
  Flooded: ["Cleared"],
  Cleared: ["Open", "Congested", "Blocked"],
};

export const SHELTER_TRANSITIONS: Record<ShelterStatus, ShelterStatus[]> = {
  Active: ["Full", "Closed"],
  Full: ["Active", "Closed"],
  Closed: ["Active"],
  Inactive: ["Active"],
};

/** Transitions that remove capacity or edges and therefore trigger re-planning. */
export const DISRUPTIVE_ROUTE: RouteStatus[] = ["Blocked", "Flooded"];
export const DISRUPTIVE_SHELTER: ShelterStatus[] = ["Closed", "Inactive", "Full"];
