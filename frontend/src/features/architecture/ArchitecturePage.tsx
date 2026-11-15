import { ArrowDown, CheckCircle2, Database, Layers, Network, Server, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/common";
import { Badge, Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { apiMode } from "@/api/client";
import { cn } from "@/lib/utils";

const LAYERS: { name: string; icon: typeof Layers; tone: string; items: string[]; note?: string }[] = [
  {
    name: "Presentation – React + TypeScript (this app)",
    icon: Layers,
    tone: "border-info/50 bg-info/10",
    items: ["Command Dashboard", "Allocation Plan + Why drawer", "Plan Versions", "Drill Mode", "God's Eye View (3D)", "CRUD screens", "Check-in", "Field (PWA, offline)", "Public (EN/HI/TA)"],
    note: "TanStack Query · Zustand · React-Leaflet · Recharts · Tailwind/shadcn. 3D globe: god's-eye-view (submodule, embedded via postMessage)",
  },
  {
    name: "REST API contract – SafeRouteApi",
    icon: Network,
    tone: "border-violet/50 bg-violet/10",
    items: ["HttpApi → FastAPI /api/v1 (zod-validated)", "MockApi → in-browser service (IndexedDB)", "Switch: VITE_API_MODE=mock|live"],
  },
  {
    name: "Business services",
    icon: Server,
    tone: "border-accent/50 bg-accent/10",
    items: ["DisasterService", "ShelterService", "RouteService", "ResourceService", "EvacuationService", "AuthService (JWT, RBAC)", "Audit / Notifications"],
    note: "Backend: app/services/*.py · Mock: src/api/mock/planning.ts",
  },
  {
    name: "Decision / planning engines",
    icon: ShieldCheck,
    tone: "border-warn/50 bg-warn/10",
    items: ["Priority engine (FR-06)", "Allocation: Greedy | Min-Cost Flow (FR-07/08/09)", "Route feasibility & cost", "Event-driven re-planning (FR-10)", "Explainability & plan diff"],
    note: "Backend: app/engines/*.py · Frontend: src/engine/*.ts (pure, unit-tested)",
  },
  {
    name: "Repository / data access",
    icon: Database,
    tone: "border-ok/50 bg-ok/10",
    items: ["SQLAlchemy 2.0 models (app/models)", "PostgreSQL / SQLite", "Mock: DbState tables + extension tables"],
  },
];

const FRS: { id: string; text: string; screen: string; endpoint: string; module: string; test: string }[] = [
  { id: "FR-01", text: "Create and manage disaster incidents", screen: "Top bar · Drill (scenario load)", endpoint: "GET/POST/PUT /disasters", module: "seed/build.ts", test: "demoFlow: seeded scenario" },
  { id: "FR-02", text: "Register and update affected zones", screen: "Zones", endpoint: "GET/POST/PUT /zones", module: "features/resources/ZonesPage", test: "demoFlow: seed data" },
  { id: "FR-03", text: "Shelter capacity, occupancy and facilities", screen: "Shelters · Check-in", endpoint: "GET/POST/PUT /shelters, POST /shelters/facilities", module: "mock/views.ts shelterView", test: "cost.test: reserve; demoFlow: check-in" },
  { id: "FR-04", text: "Route status and risk", screen: "Routes · Drill", endpoint: "GET/POST/PUT /routes", module: "lib/stateMachines.ts", test: "cost.test: blocked edge" },
  { id: "FR-05", text: "Vehicles and response-team availability", screen: "Vehicles & Teams · Field", endpoint: "GET/POST/PUT /vehicles, /rescue-teams", module: "engine/allocate.ts dispatchVehicles", test: "allocate.test: vehicles & ETA" },
  { id: "FR-06", text: "Evacuation priority for populations", screen: "Allocation Plan (ordering)", endpoint: "(engine) priority_engine.py", module: "engine/priority.ts", test: "replan.test: backend parity" },
  { id: "FR-07", text: "Feasible shelters via hard constraints", screen: "Why drawer → infeasible alternatives", endpoint: "POST /evacuations/generate", module: "engine/cost.ts evaluateEdge", test: "cost.test: hard constraints" },
  { id: "FR-08", text: "Rank shelters by suitability factors", screen: "Why drawer → cost breakdown", endpoint: "POST /evacuations/generate", module: "engine/cost.ts routeCost", test: "cost.test: routeCost" },
  { id: "FR-09", text: "Evacuation & resource assignments", screen: "Allocation Plan · Strategy comparison", endpoint: "POST /evacuations/generate", module: "engine/allocate.ts (Greedy, MCF)", test: "allocate.test: both strategies" },
  { id: "FR-10", text: "Dynamic reallocation on changes", screen: "Drill · Plan Versions (diff)", endpoint: "POST /evacuations/reallocate", module: "engine/replan.ts · mock/planning.ts", test: "replan.test · demoFlow: only affected change" },
  { id: "FR-11", text: "Role-based access control", screen: "Role switcher · 403 screens", endpoint: "JWT + require_roles()", module: "lib/rbac.ts", test: "demoFlow: RBAC" },
  { id: "FR-12", text: "Notifications and audit events", screen: "Audit & Notifications · bell", endpoint: "GET /logs/audit, /logs/notifications", module: "mock/planning.ts audit()", test: "demoFlow: override audited" },
];

const ENTITIES: [string, string, string][] = [
  ["USER", "users (app/models/user.py)", "User, SessionUser, UserScope"],
  ["Disaster", "disasters", "Disaster"],
  ["AffectedZone", "affected_zones", "AffectedZone + ZoneExt (severity 1–5, polygon) + Household"],
  ["Shelter", "shelters + shelter_facilities", "Shelter + ShelterExt (10% reserve, walk-ins)"],
  ["Route", "routes", "Route + RouteExt (geometry, named segments)"],
  ["Vehicle / RescueTeam", "vehicles, rescue_teams", "Vehicle + VehicleExt (team, position)"],
  ["EvacuationPlan", "evacuation_plans", "EvacuationPlan + PlanVersion (v1, v2… with diff)"],
  ["Assignment", "evacuation_assignments + vehicle_assignments", "EvacuationAssignment + AssignmentExt (explanation, ETA, approval)"],
  ["Resource", "resources", "Resource"],
  ["Notification / AuditLog", "notifications, audit_logs", "Notification, AuditLog (append-only)"],
];

export function ArchitecturePage() {
  return (
    <div>
      <PageHeader icon={Network} title="Architecture & Requirement Traceability" description="Layered architecture (lab Experiment 4), entity mapping (Experiment 5) and FR-01…FR-12 coverage (Experiment 2)." />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="p-5">
            <h2 className="font-semibold">Layered architecture</h2>
            <p className="text-sm text-muted">Frontend → REST API → Business Services → Allocation/Route Engine → Repository → PostgreSQL</p>
            <ol className="mt-4 space-y-1">
              {LAYERS.map((l, i) => (
                <li key={l.name}>
                  <div className={cn("rounded-lg border p-3", l.tone)}>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <l.icon className="size-4" aria-hidden /> {l.name}
                      {i === 1 ? <Badge tone={apiMode === "mock" ? "violet" : "ok"} className="ml-auto">active: {apiMode}</Badge> : null}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {l.items.map((it) => (
                        <li key={it} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs">
                          {it}
                        </li>
                      ))}
                    </ul>
                    {l.note ? <p className="mt-2 text-xs text-muted">{l.note}</p> : null}
                  </div>
                  {i < LAYERS.length - 1 ? (
                    <div className="flex justify-center py-0.5 text-muted" aria-hidden>
                      <ArrowDown className="size-4" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Re-planning flow (FR-10)</h2>
            <p className="text-sm text-muted">What happens when a bridge floods during a drill.</p>
            <ol className="mt-4 space-y-3 text-sm">
              {[
                ["Event", "RouteSegmentBlocked(“Thiru Vi Ka Bridge”) → every route via that segment set to Flooded."],
                ["Select affected", "replan.selectAffected(): only Scheduled / In-Progress assignments on those routes; delivered households stay."],
                ["Stability", "Households already in vehicles carry a +40 en-route penalty; any destination change costs +12."],
                ["Re-allocate", "Displaced + previously unallocated households run through the same strategy (Greedy or Min-Cost Flow) against remaining capacity."],
                ["Version & diff", "New PlanVersion vN+1 (Proposed) with a household-level diff: who moved, from → to, why, ΔETA."],
                ["Human in the loop", "Coordinator reviews, approves, or overrides with a reason; everything lands in the append-only audit log."],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">{i + 1}</span>
                  <span>
                    <span className="font-medium">{title}.</span> <span className="text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <h3 className="mt-6 font-semibold">Cost function</h3>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed">
{`cost/person = travel_time × congestion × severity_weight
            + risk_penalty(route)
            + facility_penalty(missing power/water/food, pets)
            + utilisation_penalty(> 90%)
            + stability_penalty(re-plans only)

edge removed if: route Blocked/Flooded · shelter Closed/Full
                 · required facility missing · no capacity`}
            </pre>
          </Card>
        </div>

        <Card>
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Functional requirement traceability</h2>
            <p className="text-sm text-muted">Each SRS requirement from the lab file mapped to where it is implemented and verified.</p>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>ID</TH>
                <TH>Requirement</TH>
                <TH>Screen</TH>
                <TH>Backend endpoint</TH>
                <TH>Frontend module</TH>
                <TH>Verified by</TH>
              </TR>
            </THead>
            <TBody>
              {FRS.map((f) => (
                <TR key={f.id}>
                  <TD>
                    <Badge tone="ok">
                      <CheckCircle2 /> {f.id}
                    </Badge>
                  </TD>
                  <TD className="text-sm">{f.text}</TD>
                  <TD className="text-xs">{f.screen}</TD>
                  <TD className="font-mono text-xs text-muted">{f.endpoint}</TD>
                  <TD className="font-mono text-xs text-muted">{f.module}</TD>
                  <TD className="text-xs">{f.test}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Entity mapping (ER diagram → backend → frontend)</h2>
            <p className="text-sm text-muted">Backend tables are mirrored field-for-field; extensions are separate records keyed by the same primary key.</p>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Lab ER entity</TH>
                <TH>Backend table(s)</TH>
                <TH>Frontend type(s)</TH>
              </TR>
            </THead>
            <TBody>
              {ENTITIES.map(([e, b, f]) => (
                <TR key={e}>
                  <TD className="font-medium">{e}</TD>
                  <TD className="font-mono text-xs text-muted">{b}</TD>
                  <TD className="text-xs">{f}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Notes>
          Non-functional requirements: <b>security</b> (JWT, RBAC on every write, scoped Shelter Manager / Field Team), <b>usability</b> (WCAG AA tokens, icons + labels for every status,
          keyboard navigation, EN/HI/TA), <b>reliability</b> (offline sync queue, PWA cache), <b>testability</b> (pure engine + Vitest + Playwright), <b>maintainability</b> (one API
          interface, typed contract shared with runtime validation).
        </Notes>
      </div>
    </div>
  );
}

function Notes({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">{children}</p>;
}
