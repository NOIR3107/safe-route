/**
 * Role-based access control (FR-11). A copy of backend/app/core/rbac.py so the UI only shows what a
 * role can use; the server is what enforces it. Admin is always allowed. Relief Staff and NGO
 * volunteers are read-only (lab file, Experiment 2 stakeholders).
 */
import type { UserRole } from "@/api/schemas";

export type Permission =
  | "dashboard:view"
  | "plan:view"
  | "plan:generate" // POST /evacuations/generate
  | "plan:approve"
  | "plan:override" // POST /evacuations/reallocate
  | "drill:run"
  | "zone:write" // POST/PUT /zones
  | "shelter:write" // POST/PUT /shelters
  | "route:write" // POST /routes
  | "route:status" // PUT /routes (includes Response Team)
  | "vehicle:write" // POST /vehicles
  | "vehicle:status" // PUT /vehicles (includes Response Team)
  | "team:write" // POST /rescue-teams
  | "team:status" // PUT /rescue-teams (includes Response Team)
  | "audit:read" // GET /logs/audit
  | "shelter:checkin"
  | "field:update"
  | "users:read";

const MATRIX: Record<Permission, UserRole[]> = {
  "dashboard:view": ["Emergency Authority", "Evacuation Coordinator", "Transport Coordinator", "Relief Staff", "NGO Volunteer"],
  "plan:view": ["Emergency Authority", "Evacuation Coordinator", "Transport Coordinator", "Relief Staff", "NGO Volunteer"],
  "plan:generate": ["Emergency Authority", "Evacuation Coordinator"],
  "plan:approve": ["Emergency Authority", "Evacuation Coordinator"],
  "plan:override": ["Emergency Authority", "Evacuation Coordinator"],
  "drill:run": ["Emergency Authority", "Evacuation Coordinator"],
  "zone:write": ["Emergency Authority", "Evacuation Coordinator"],
  "shelter:write": ["Shelter Manager", "Evacuation Coordinator"],
  "route:write": ["Transport Coordinator", "Evacuation Coordinator"],
  "route:status": ["Transport Coordinator", "Evacuation Coordinator", "Response Team"],
  "vehicle:write": ["Transport Coordinator"],
  "vehicle:status": ["Transport Coordinator", "Response Team"],
  "team:write": ["Emergency Authority"],
  "team:status": ["Emergency Authority", "Response Team"],
  "audit:read": ["Emergency Authority"],
  "shelter:checkin": ["Shelter Manager"],
  "field:update": ["Response Team"],
  "users:read": [],
};

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return role === "Admin" || MATRIX[permission].includes(role);
}

export function rolesFor(permission: Permission): UserRole[] {
  return ["Admin", ...MATRIX[permission]];
}

/** Landing page per role. */
export function homeFor(role: UserRole): string {
  switch (role) {
    case "Shelter Manager":
      return "/checkin";
    case "Response Team":
      return "/field";
    default:
      return "/";
  }
}

export const ROLE_LABEL: Record<UserRole, string> = {
  Admin: "Admin",
  "Emergency Authority": "Incident Commander",
  "Evacuation Coordinator": "Coordinator",
  "Shelter Manager": "Shelter Manager",
  "Transport Coordinator": "Transport Coordinator",
  "Response Team": "Field Team",
  "Relief Staff": "Relief Staff (read-only)",
  "NGO Volunteer": "NGO Volunteer (read-only)",
};
