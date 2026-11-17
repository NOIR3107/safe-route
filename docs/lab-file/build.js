// Builds SafeRoute_Lab_File.docx: the original lab file (Exp 1-5, typo fixes only) continued with Exp 6-12.
// npm install docx@9.5.1 ; node build.js <repoDir> docs/lab-file/original-images docs/lab-file/SafeRoute_Lab_File.docx
// The PDF is exported from the .docx with Microsoft Word (File > Save as PDF).
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, Footer, PageNumber, LevelFormat, HeadingLevel, PageBreak, VerticalAlign,
} = require("docx");

const [REPO, ORIG, OUT] = process.argv.slice(2);
const DOCS = path.join(REPO, "docs");
const FONT = "Times New Roman";
const CONTENT_W = 9360; // 6.5 in in DXA (Letter, 1 in margins)
const MAX_PX = 624; // 6.5 in at 96 dpi

// ---------- helpers ----------
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, italics: o.italics });
function rich(text, o = {}) {
  // **bold** and `code` inside a string
  const parts = [];
  for (const piece of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue;
    if (piece.startsWith("**")) parts.push(run(piece.slice(2, -2), { ...o, bold: true }));
    else if (piece.startsWith("`")) parts.push(new TextRun({ text: piece.slice(1, -1), font: "Courier New", size: (o.size ?? 24) - 2 }));
    else parts.push(run(piece, o));
  }
  return parts;
}
const P = (text, o = {}) => new Paragraph({ children: rich(text, o), spacing: { after: 120, line: 276 }, alignment: o.align });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text, { size: 32, bold: true })], pageBreakBefore: true });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text, { size: 28, bold: true })] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(text, { size: 24, bold: true })] });
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: "bul", level: 0 }, children: rich(t), spacing: { after: 60 } }));
const numbered = (items, ref) => items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: rich(t), spacing: { after: 60 } }));
const code = (lines) => lines.map((l, i) => new Paragraph({ children: [new TextRun({ text: l || " ", font: "Courier New", size: 18 })], spacing: { after: i === lines.length - 1 ? 160 : 0 } }));
const brk = () => new Paragraph({ children: [new PageBreak()] });

const border = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const w = widths.map((x) => Math.round(x * scale));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const size = o.size ?? 22;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      cantSplit: true,
      children: r.map((c, ci) => new TableCell({
        borders,
        width: { size: w[ci], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: String(c).split("\n").map((line) => new Paragraph({ children: rich(line, { size, bold: ri === 0 }), alignment: o.align?.[ci] })),
      })),
    })),
  });
}
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  // JPEG: scan for SOF0/2
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("size? " + file);
}
function img(file, o = {}) {
  const [w0, h0] = pngSize(file);
  const maxW = o.maxW ?? MAX_PX;
  const maxH = o.maxH ?? 800;
  const s = Math.min(maxW / w0, maxH / h0, o.allowUp ? 99 : 1e9);
  const type = file.endsWith(".png") ? "png" : "jpg";
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new ImageRun({ type, data: fs.readFileSync(file), transformation: { width: Math.round(w0 * s), height: Math.round(h0 * s) } })],
  });
}
const caption = (t) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(t, { size: 20, italics: true })], spacing: { after: 200 } });
const shot = (rel) => path.join(DOCS, "screenshots", rel);
const uml = (n) => path.join(DOCS, "uml", "out", n);
const o = (n) => path.join(ORIG, n);

// ---------- original front matter ----------
const cover = [
  new Paragraph({ children: [], spacing: { before: 1200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run("JSS UNIVERSITY", { size: 52, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run("NOIDA", { size: 52, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Department Of Computer Science and Engineering", { size: 36 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run("(AI/ML)", { size: 36 })] }),
  img(o("p01_0.png"), { maxW: 200, maxH: 200 }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 300 }, children: [run("Software Engineering Lab File", { size: 36, bold: true })] }),
  img(o("p01_1.png"), { maxW: 600 }),
];
const team = [
  new Paragraph({ children: [], spacing: { before: 2400 }, pageBreakBefore: true }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run("SafeRoute", { size: 52, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [run("Disaster Evacuation & Shelter Allocation System", { size: 32 })] }),
  ...[["Bhoomika", "J240211026"], ["Akshita Upadhyay", "J240211005"], ["Neel Tripathi", "J240211049"], ["Tanishq Saxena", "J240211060"]].flatMap(([n, r]) => [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(n, { size: 28, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(r, { size: 26 })] }),
  ]),
];
const EXPS = [
  "Problem selection and feasibility study; preparation of brief project charter.",
  "Requirements elicitation using stakeholder interviews/questionnaires; preparation of Software Requirements Specification (SRS)",
  "Creation of UML diagrams: use case, class, activity, and sequence diagrams",
  "Architectural design: preparation of layered or microservice-inspired architecture diagram",
  "Database design: Entity–Relationship (ER) diagram and relational schema design.",
  "Implementation of core modules following coding standards",
  "Integration of modules and live data; end-to-end verification",
  "Unit testing with automated tests and code coverage",
  "Version control and collaborative workflow with Git and GitHub",
  "Continuous integration with GitHub Actions",
  "Test plan, test case specification and test report (IEEE 829)",
  "Debugging, documentation (README, user manual) and final report",
];
const index = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 240 }, children: [run("Index", { size: 36, bold: true })] }),
  table([["Week", "Experiment", "Date"], ...EXPS.map((e, i) => [String(i + 1), e, ""])], [900, 6600, 1860], { align: [AlignmentType.CENTER] }),
];
const overview = [
  H1("Project Overview"),
  P("SafeRoute is a web-based disaster evacuation and shelter allocation decision-support system. It assists emergency authorities in coordinating evacuation during floods, earthquakes, fires, and similar emergencies. The system combines affected-zone information, population, shelter capacity, facilities, route status, vehicles, and response teams to generate feasible evacuation plans."),
  H2("Core Idea"),
  P("SafeRoute does not attempt to predict disasters. Its purpose is to support emergency planning and resource allocation after an incident has been identified."),
  H2("Main Features"),
  ...bullets(["Disaster and affected-zone management", "Shelter capacity and facility management", "Vehicle and rescue-team management", "Route and route-status management", "Constraint-based shelter allocation", "Dynamic reallocation when shelters or routes become unavailable", "Emergency monitoring dashboard", "Role-based authentication and authorization", "Notifications and audit logs"]),
  H2("Proposed Technology Stack"),
  table([["Layer", "Technology"], ["Frontend", "React"], ["Backend", "Python + FastAPI"], ["Database", "PostgreSQL"], ["ORM", "SQLAlchemy"], ["Authentication", "JWT / role-based access"], ["Testing", "PyTest + API integration tests"], ["Version Control", "Git + GitHub"], ["CI", "GitHub Actions"], ["UML / Design", "PlantUML / draw.io"]], [4680, 4680]),
];

// ---------- Experiments 1-5 (original text; typo fixes listed in Appendix B) ----------
const exp1 = [
  H1("Experiment 1 – Problem Selection, Feasibility Study & Project Charter"),
  H2("Objective"), P("To identify a real-world software problem, assess its feasibility, define the project scope, and prepare a brief project charter."),
  H2("Problem Statement"), P("During disasters, emergency authorities must coordinate affected populations, shelters, evacuation routes, vehicles, and response teams while conditions may change rapidly. Manual coordination can make it difficult to allocate people to suitable shelters and re-plan evacuation when a route is blocked or a shelter becomes unavailable."),
  H2("Proposed Solution"), P("SafeRoute will maintain disaster, affected-zone, shelter, route, vehicle, and response-team data and use a constraint-based allocation engine to generate and dynamically update evacuation plans."),
  H2("Feasibility Study"),
  table([["Feasibility", "Assessment"], ["Technical", "Feasible using Python/FastAPI, React, PostgreSQL, GitHub and PyTest. No specialized hardware is required."], ["Economic", "The proposed stack is open-source and suitable for an academic prototype."], ["Operational", "The system supports emergency, shelter, transport and response roles through role-based access."], ["Schedule", "The system can be developed incrementally from requirements through testing and CI."]], [4680, 4680]),
  H3("Project Charter"),
  table([["Item", "Description"], ["Project", "SafeRoute – Disaster Evacuation & Shelter Allocation System"], ["Goal", "Provide decision support for evacuation planning and resource allocation."], ["Primary Users", "Emergency authority, evacuation coordinator, shelter manager, transport coordinator, response teams, administrator."], ["Scope", "Disaster, zone, shelter, route, resource, allocation, dashboard, authentication, alerts and audit."], ["Out of Scope", "Disaster prediction, autonomous vehicle control, physical traffic control and guaranteed real-world emergency dispatch."], ["Key Deliverable", "Working web prototype with documented design, tests, Git workflow and CI."]], [4680, 4680]),
  H2("Expected Output"), ...bullets(["Feasibility study", "Project charter", "Initial scope and stakeholder list"]),
];
const exp2 = [
  H1("Experiment 2 – Requirements Elicitation & SRS"),
  H2("Objective"), P("To gather stakeholder requirements through interviews/questionnaires and convert them into a structured Software Requirements Specification."),
  H2("Stakeholder Groups"), ...bullets(["Emergency Management Authority", "Evacuation Coordinator", "Shelter Manager", "Transportation Coordinator", "Rescue/Response Team", "Medical/Relief Personnel", "NGOs/Volunteers", "System Administrator"]),
  H2("Sample Interview / Questionnaire"),
  ...numbered(["What information is needed to initiate an evacuation?", "How should affected zones and their severity be recorded?", "How is shelter capacity currently monitored?", "What should happen when a shelter reaches capacity?", "How should blocked or unsafe routes be reported?", "What information is required for vehicle assignment?", "Which categories of evacuees require higher priority?", "Which alerts should emergency coordinators receive?", "What information should be visible on the monitoring dashboard?", "Which actions should be restricted to authorized roles?"], "q"),
  H2("Functional Requirements"),
  table([["ID", "Requirement"], ["FR-01", "The system shall allow authorized users to create and manage disaster incidents."], ["FR-02", "The system shall allow users to register and update affected zones."], ["FR-03", "The system shall maintain shelter capacity, occupancy and facilities."], ["FR-04", "The system shall maintain route status and route risk information."], ["FR-05", "The system shall maintain vehicles and response-team availability."], ["FR-06", "The system shall calculate evacuation priority for affected populations."], ["FR-07", "The system shall identify feasible shelters using hard constraints."], ["FR-08", "The system shall rank feasible shelters using configurable suitability factors."], ["FR-09", "The system shall generate evacuation assignments and resource assignments."], ["FR-10", "The system shall dynamically reallocate assignments when critical conditions change."], ["FR-11", "The system shall provide role-based access control."], ["FR-12", "The system shall record notifications and audit events."]], [1600, 7760]),
  H2("Non-Functional Requirements"), ...bullets(["Security", "Usability", "Maintainability", "Reliability", "Performance", "Scalability", "Testability", "Availability"]),
  H2("Acceptance Criteria"), ...bullets(["Authorized users can create a disaster and affected zones.", "Shelters with no capacity or inaccessible routes are excluded from allocation.", "A valid evacuation plan can be generated and stored.", "Changing shelter or route status can trigger reallocation.", "Unauthorized users cannot access restricted operations."]),
];
const exp3 = [
  H1("Experiment 3 – UML Diagrams"),
  H2("Objective"), P("To model the functional and structural behavior of SafeRoute using standard UML diagrams."),
  H2("A. Use Case Diagram – Main Actors"), img(o("p09_0.png"), { maxH: 380 }),
  H2("B. Class Diagram – Core Classes"), img(o("p09_1.png"), { maxH: 380 }),
  H2("C. Activity Diagram – Generate Evacuation Plan"), img(o("p10_0.png"), { maxH: 760 }),
  H2("D. Sequence Diagram – Create Evacuation Plan"), img(o("p11_0.png")), img(o("p11_1.png"), { maxH: 520 }),
];
const exp4 = [
  H1("Experiment 4 – Architectural Design"),
  H2("Objective"), P("To design a maintainable layered architecture that separates presentation, API, business services, decision logic and data access."),
  H2("Architecture"), img(o("p12_0.png"), { maxH: 600 }),
  H2("Design Rationale"), ...bullets(["Layer separation reduces coupling and improves maintainability.", "The allocation engine can be unit tested independently.", "Repository classes isolate database operations from business logic.", "REST APIs allow the frontend to evolve independently.", "The architecture is modular without the deployment complexity of true microservices."]),
];
const exp5 = [
  H1("Experiment 5 – Database design: Entity–Relationship (ER) diagram and relational schema design"),
  H2("Objective"), P("To design a structured relational database for the SafeRoute Disaster Evacuation and Shelter Allocation System using an Entity–Relationship (ER) diagram and relational schema, ensuring data integrity, consistency, and efficient retrieval of disaster, shelter, route, vehicle, and evacuation assignment information."),
  H2("A. Database Design Overview"), P("SafeRoute requires a relational database to store and manage information about disaster incidents, affected zones, shelters, evacuation routes, vehicles, resources, and evacuation plans. PostgreSQL is the proposed database technology, as specified in the project overview on page 4."),
  H2("B. Entities and their attributes"),
  table([["Entity", "Key Attributes"], ["USER", "User_ID (PK), Name, Role, Email"], ["Disaster", "Disaster_ID (PK), Type, Severity, Status"], ["AffectedZone", "Zone_ID (PK), Disaster_ID (FK), Location, Population, Priority"], ["Shelter", "Shelter_ID (PK), Name, Location, Capacity, Occupancy, Facilities"], ["Route", "Route_ID (PK), Source, Destination, Risk_Level, Status"], ["Vehicle", "Vehicle_ID (PK), Type, Capacity, Status"], ["EvacuationPlan", "Plan_ID (PK), Disaster_ID (FK), Created_By (FK), Status, Created_At"], ["Assignment", "Assignment_ID (PK), Plan_ID (FK), Zone_ID (FK), Shelter_ID (FK), People_Count"], ["Resource", "Resource_ID (PK), Resource_Type, Quantity, Availability"], ["Notification", "Notification_ID (PK), User_ID (FK), Message, Timestamp"], ["AuditLog", "Log_ID (PK), User_ID (FK), Action, Timestamp"]], [2800, 6560]),
  P("PK = Primary Key; FK = Foreign Key."),
  P("These entities are consistent with the classes and system functions already represented in your Experiment 3 UML diagrams."),
  H2("C. Entity–Relationship (ER) Diagram"), img(o("p15_0.png"), { maxH: 440 }),
  H2("D. Database Constraints and Normalization"),
  ...bullets(["Primary key: Uniquely identifies each record.", "Foreign key: Maintains referential integrity between related tables.", "NOT NULL: Ensures required fields are not left empty.", "UNIQUE: Prevents duplicate values where uniqueness is required.", "CHECK constraints: For example, Capacity > 0, Occupancy >= 0, and People_Count > 0.", "Normalization: Explain how 1NF, 2NF, and 3NF reduce duplicate data and update anomalies. For SafeRoute, also mention that shelter occupancy must not exceed shelter capacity and that assignments should reference valid shelters and affected zones."]),
  H2("E. Design Rationale"),
  ...numbered(["A relational database provides structured storage for disaster management data.", "Primary and foreign keys maintain data integrity.", "Normalization reduces unnecessary data duplication.", "Separate tables make it easier to update shelter, route, and vehicle information.", "The schema supports evacuation planning, resource allocation, and dynamic reallocation."], "r5"),
  H2("F. Expected Output"), ...bullets(["ER diagram of the SafeRoute database.", "Relational schema containing all major entities.", "Identification of primary keys and foreign keys.", "Database constraints and normalization details."]),
  P("The implementation of Experiments 1–5 (traceability matrix, PlantUML diagrams of the built system, layer-to-folder mapping, the real schema and the normalization explanation) is in Appendix A."),
];

// ---------- Experiments 6-12 ----------
const exp6 = [
  H1("Experiment 6 – Implementation of Core Modules"),
  H2("Objective"), P("To implement the core modules of SafeRoute from the design in Experiments 3–5, following coding standards that keep the code readable and testable."),
  H2("Procedure"),
  ...numbered([
    "Set up the stack from the project overview: React (TypeScript, Vite) for the frontend; Python 3.12 + FastAPI for the backend; PostgreSQL 16 with SQLAlchemy 2 and Alembic; JWT for authentication.",
    "Built the layers bottom-up: models and migrations → repositories → engine → services → API → frontend pages.",
    "Wrote the allocation engine as pure functions with typed inputs, so the same input always gives the same plan (TC-ENG-18).",
    "Applied coding standards checked by tools: ruff (lint and format) for Python; strict TypeScript, ESLint with zero warnings, and zod schemas for every API response in the frontend.",
    "Kept configuration out of code: planning weights and thresholds in PlanningConfig (overridable by backend/planning.json); server settings in .env.",
  ], "p6"),
  H2("Output"),
  table([
    ["Module", "Location", "What it does"],
    ["Authentication & RBAC (FR-11)", "app/core/security.py, rbac.py, api/auth.py", "bcrypt passwords, JWT, one permission table for 8 roles; shelter managers and field teams are scoped to their own shelter or team"],
    ["Master data (FR-01..05)", "app/services/catalog.py", "CRUD for disasters, zones, shelters, routes, vehicles, teams, resources; only legal status transitions (illegal ones return 409)"],
    ["Priority (FR-06)", "app/engine/priority.py", "Weighted score of zone risk, priority code (P1–P4), disaster severity, people still waiting and the vulnerable share"],
    ["Feasibility & ranking (FR-07, FR-08)", "app/engine/allocate.py, cost.py", "Excludes closed shelters, blocked/flooded routes, missing facilities, full shelters and long walks; ranks the rest by a weighted cost (travel time × congestion × severity, plus risk, facility, load and stability penalties)"],
    ["Allocation (FR-09)", "app/engine/allocate.py, mcf.py", "Greedy and Min-Cost Flow; vehicles dispatched by capacity and need (ambulance for medical groups); supplies allocated per person"],
    ["Re-planning (FR-10)", "app/engine/replan.py, diff.py, services/planning.py", "Moves only affected groups; saves a new Proposed version with a diff, a notification and an audit entry; approval is role-gated"],
    ["Shelter status", "app/engine/status.py", "Open / Near Full / Full / Closed from (present + inbound) / capacity; thresholds 0.75 and 1.0 in config"],
    ["Audit & notifications (FR-12)", "app/services/logbook.py", "Audits every important write; links alerts to their audit entry"],
    ["Live data", "app/ingestion, api/ws.py, core/events.py", "Validated feed messages applied through the services; WebSocket push of changes and a 1 s heartbeat"],
    ["Drills", "app/services/drill.py", "Copy live data to a drill database; scripted timeline with a clock; inject events; end and return to live"],
    ["Frontend", "frontend/src", "One data store fed by REST and WebSocket; one CesiumJS map; 14 pages, shown per role"],
  ], [2300, 2700, 4360], { size: 20 }),
  gap(),
  table([["Code size (final)", "Lines"], ["Backend application (Python)", "7,864"], ["Backend tests", "1,304"], ["Frontend (TypeScript/TSX, excluding tests)", "9,095"]], [6000, 3360], { align: [undefined, AlignmentType.RIGHT] }),
  gap(),
  P("Example fix: a shelter at 90% load with only its 10% walk-in reserve free used to be shown as Full. The status module now computes it from real numbers with thresholds in config, so it shows Near Full (tests TC-ENG-31, TC-ENG-32)."),
  img(shot("admin/shelters.png"), { maxH: 380 }), caption("Shelters page: status from real load; map with capacity rings"),
  H2("Conclusion"), P("The core modules are implemented in the layers of Experiment 4. Lint, format and type checks enforce the coding standards on every change."),
];
const exp7 = [
  H1("Experiment 7 – Integration of Modules"),
  H2("Objective"), P("To integrate the frontend, API, services, engine, database and live-data feed into one working system, and to check that data moves correctly across every boundary."),
  H2("Procedure"),
  ...numbered([
    "Defined the contract: FastAPI publishes OpenAPI from Pydantic models; the frontend mirrors each response as a zod schema and validates every reply.",
    "Removed the in-browser mock API; the frontend has one HTTP client that talks only to the backend.",
    "Connected live updates: after each committed write the backend publishes the changed topics on the /ws WebSocket and the browser refetches only those.",
    "Connected the live feed: POST /api/v1/ingest with an X-Ingest-Token header; messages go through the same services as user actions.",
    "Ran API integration tests on a real PostgreSQL database and a Playwright sweep of every page for every role.",
    "Traced one value end to end and tested connection loss by hand.",
  ], "p7"),
  H2("Output"),
  table([
    ["Boundary", "Mechanism", "Checked by"],
    ["Browser ↔ API", "REST/JSON under /api/v1 (61 operations + /health), JWT bearer", "zod; TC-API tests"],
    ["API → browser", "WebSocket /ws: hello, changed {topics, mode}, tick every 1 s", "TC-API-26; TC-UI-01..05"],
    ["Feed → API", "POST /api/v1/ingest: typed messages (route, shelter, occupancy, walk-ins, facilities, GPS, pickup, arrival, road geometry)", "TC-API-21..25"],
    ["Services → engine", "EngineInput in, AllocationResult out", "TC-ENG tests"],
    ["Repositories → PostgreSQL", "SQLAlchemy 2; writes serialized by an advisory lock", "TC-API tests"],
  ], [2200, 4960, 2200], { size: 20 }),
  H3("One value end to end (run on 17 Nov 2026)"),
  ...code([
    "API before: shelter 4 current_occupancy=40; sending feed value 57",
    "POST /ingest -> 200 {\"accepted\":1,\"rejected\":0,\"errors\":[]}",
    "UI shows 57 after 1828 ms (no reload)",
    "API after: current_occupancy=57",
  ]),
  P("Path: feed → POST /ingest → Pydantic message → adapter → catalog service → shelters.current_occupancy in PostgreSQL → commit → WebSocket “changed” → browser refetch → Shelters table and map ring."),
  H3("Connection loss and recovery (same run)"),
  ...code([
    "15:16:47  state=live          \"Live\"",
    "15:16:55  state=disconnected  \"Disconnected · retrying in 3 s\"   (backend stopped)",
    "15:17:10  state=live          \"Live\"                             (backend restarted)",
    "page errors: none",
  ]),
  P("When the socket closes the UI goes straight to Disconnected and reconnects by itself. The Stale state (socket open but silent for 5 s) is covered by the unit test TC-UI-02."),
  H2("Conclusion"), P("All modules work together on live data: a feed value reaches the database, the API and every open screen without a reload, and the UI recovers after losing the backend."),
];
const exp8 = [
  H1("Experiment 8 – Unit Testing"),
  H2("Objective"), P("To write automated unit tests for the core logic with at least 80% line coverage of the backend, and to test the frontend's own logic."),
  H2("Procedure"),
  ...numbered([
    "Split tests by layer: engine tests (no database), service tests with fake repositories (no database), API tests on a real PostgreSQL test database migrated with Alembic, and Vitest tests in the frontend.",
    "Gave every test an ID (TC-<AREA>-<NN>) kept in its function name, so reports and documents point to the same test.",
    "Added property tests for the engine on randomly generated (seeded) scenarios: capacity never exceeded, hard constraints always hold, every household placed once and never split, same input gives the same output.",
    "Ran pytest with coverage and JUnit output, and Vitest.",
  ], "p8"),
  H2("Output"),
  table([
    ["Suite", "Test functions", "Executed cases", "Passed"],
    ["Backend engine (TC-ENG-01..36)", "36", "–", "all"],
    ["Backend services (TC-SVC-01..09)", "9", "9", "9"],
    ["Backend API (TC-API-01..39)", "39", "–", "all"],
    ["Backend total", "84", "332", "332"],
    ["Frontend Vitest (TC-UI-01..10)", "10", "10", "10"],
  ], [4200, 1720, 1720, 1720], { align: [undefined, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT] }),
  P("Parametrized tests run once per parameter, so 84 backend test functions give 332 executed cases (204.9 s)."),
  table([
    ["Backend layer", "Covered / lines", "Coverage"],
    ["engine", "713 / 722", "98.8%"], ["api", "492 / 518", "95.0%"], ["repositories", "214 / 225", "95.1%"],
    ["services", "1160 / 1317", "88.1%"], ["core", "136 / 156", "87.2%"], ["ingestion", "145 / 178", "81.5%"],
    ["seed", "198 / 253", "78.3%"], ["models, schemas", "889 / 889", "100%"], ["main.py", "30 / 33", "90.9%"],
    ["Total", "3977 / 4291", "92.7%"],
  ], [4000, 2680, 2680], { align: [undefined, AlignmentType.RIGHT, AlignmentType.RIGHT] }),
  P("The 80% target is met, and CI fails below it. Frontend line coverage is not measured (the coverage plugin is not installed); the frontend is covered by the Playwright sweep in Experiment 11."),
  H2("Conclusion"), P("The backend has 332 passing test cases and 92.7% line coverage. The engine, which makes the decisions, is the best covered layer."),
];
const exp9 = [
  H1("Experiment 9 – Version Control and Collaborative Workflow"),
  H2("Objective"), P("To manage the source code with Git and GitHub using a branching model, conventional commits, pull requests with reviews, and protected branches."),
  H2("Procedure"),
  ...numbered([
    "Chose a branching model: main (release) ← develop (integration) ← feature/*, fix/*, docs/*, test/*, ci/*.",
    "Adopted Conventional Commits, e.g. feat(engine): …, fix(frontend): …, docs(exp11): ….",
    "Added CONTRIBUTING.md (branches, commits, PR rules, reviewer checklist, branch-protection steps), a pull request template, issue templates (bug report, feature/requirement) and CODEOWNERS.",
    "Defined branch protection for main and develop: pull request required, 1 approval, code-owner review, stale approvals dismissed, both CI checks required, up-to-date branches, no force pushes.",
  ], "p9"),
  H2("Output"),
  ...code([
    "main      ●──────────────────────────●───────   release; PR from develop only",
    "           \\                        /",
    "develop    ●────●────────●─────────●─────────   integration; protected",
    "                 \\      / \\       /",
    "feature/...       ●──●─●   ●──●──●              one change each, squash-merged",
  ]),
  table([["Author (git log)", "Commits"], ["Tanishq Saxena", "8"], ["akshitaupadhyay", "5"]], [6000, 3360], { align: [undefined, AlignmentType.RIGHT] }),
  P("These are the commits in the local repository when this was written, before the final feature branch was pushed."),
  P("**Status:** pushing develop, enabling protection, opening the pull requests and reviewing them need each member's GitHub account. TODO (team): add PR links and reviewers. No reviews are claimed here."),
  H2("Conclusion"), P("The repository has a documented branching model, commit format, templates and review rules; the remaining GitHub steps are listed as team tasks."),
];
const exp10 = [
  H1("Experiment 10 – Continuous Integration with GitHub Actions"),
  H2("Objective"), P("To build and test every change automatically with GitHub Actions and block merging when lint, tests or coverage fail."),
  H2("Procedure"),
  ...numbered([
    "Replaced two old workflows (which pointed at folders that no longer exist) with one pipeline, .github/workflows/ci.yml.",
    "Backend job: postgres:16 service with a health check; Python 3.12 with pip caching; ruff check and ruff format --check; pytest with coverage failing under 80%; JUnit and coverage XML uploaded as artifacts.",
    "Frontend job: Node 22 with npm caching; npm ci; typecheck; ESLint (zero warnings); Vitest with a JUnit report; production build; report uploaded.",
    "Triggers: every pull request and pushes to main and develop; a newer run cancels an older one on the same branch.",
    "Added the CI badge to the README and ran every pipeline step locally.",
  ], "p10"),
  H2("Output"),
  table([
    ["Step (run locally, 17 Nov 2026)", "Result"],
    ["ruff check .", "All checks passed"], ["ruff format --check .", "83 files already formatted"],
    ["pytest --cov=app", "332 passed, 92.7% coverage"], ["npm run typecheck", "No errors"],
    ["npm run lint", "No warnings"], ["vitest run (JUnit report)", "10 passed"], ["npm run build", "Exit 0"],
  ], [4680, 4680]),
  P("**Status on GitHub:** not yet run, because the branch has not been pushed. TODO (team): confirm both jobs are green on GitHub and attach the run link."),
  H2("Conclusion"), P("The pipeline checks style, types, unit and API tests on a real PostgreSQL database, coverage and the production build. With branch protection on, nothing merges while any of them fails."),
];
const exp11 = [
  H1("Experiment 11 – Test Plan, Test Cases and Test Report (IEEE 829)"),
  H2("Objective"), P("To plan the testing of SafeRoute in the IEEE 829 format, specify the test cases, and report the results of a real test run."),
  H2("Procedure"),
  ...numbered(["Wrote the test plan.", "Specified the cases as automated tests with IDs; the full case table is generated from the source and the JUnit result (docs/exp11/test-cases.md).", "Ran the backend suite, the frontend tests, the Playwright sweep of every page for every role, and the manual verification run.", "Wrote the incident and summary reports from those outputs."], "p11"),
  H2("Output"),
  H3("A. Test plan (SR-TP-01)"),
  table([
    ["Item", "SafeRoute"],
    ["Test items", "Backend (engine, services, repositories, API, ingestion, WebSocket); frontend; PostgreSQL schema and migrations"],
    ["Features to be tested", "FR-01..FR-12; live data; drills on a copy; RBAC for all 8 roles; shelter status thresholds"],
    ["Not tested", "Real disaster feeds (none available; recorded sample used); OSRM availability; load beyond the seeded scenario"],
    ["Approach", "Engine unit tests; service tests with fakes; API tests on PostgreSQL; Vitest; Playwright sweep failing on any console error; one manual end-to-end trace and connection-loss test"],
    ["Pass/fail criteria", "All assertions hold; backend line coverage ≥ 80%; no console error on any page"],
    ["Suspension", "If the test database cannot be migrated; resume after the migration is fixed"],
    ["Deliverables", "This plan; case table; junit.xml, coverage.xml, vitest-junit.xml; screenshots; this report"],
    ["Environment", "Windows 11, Python 3.12.10, PostgreSQL 16.6, Node 24.20.0, Chromium; CI: ubuntu-latest, postgres:16"],
    ["Responsibilities, approvals", "TODO (team)"],
    ["Risks", "Timing-dependent drill tests (assert on the drill clock); WebGL in headless CI (map checked for errors, not frame rate)"],
  ], [2600, 6760], { size: 20 }),
  H3("B. Test case specification (summary; 84 functions, 332 cases)"),
  table([
    ["Area", "IDs", "Level", "Covers"],
    ["Engine", "TC-ENG-01..36", "Unit", "Feasibility, ranking, priority, allocation properties, vehicle constraint, re-plan, diff, status, geometry"],
    ["Services", "TC-SVC-01..09", "Unit (fakes)", "Transitions, scoping, re-plan triggers, approval and audit"],
    ["API", "TC-API-01..39", "Integration", "Auth and RBAC, full lab flow, CRUD, ingestion, WebSocket, drills, timeline"],
    ["Frontend", "TC-UI-01..10", "Unit", "Connection states, refetch routing, map styles"],
    ["End to end", "pages.spec.ts", "System", "Every page for each of the 8 roles and the public page"],
  ], [1400, 1800, 1600, 4560], { size: 20 }),
  gap(),
  table([
    ["ID", "Input", "Expected", "Result"],
    ["TC-ENG-02", "Shelter reachable only by a Blocked, then a Flooded route", "Infeasible; reason names the route status", "PASS"],
    ["TC-API-12", "Coordinator closes Guindy School, which has assignments", "Shelter Closed; plan v2 Proposed (trigger ShelterClosed); every affected person moved or reported unallocated; “REPLANNING v2” notification", "PASS"],
    ["TC-API-07", "Shelter Manager (T. Nagar) updates another shelter", "403", "PASS"],
    ["TC-API-22", "POST /ingest: route_status Flooded for a named road", "Routes on that road Flooded; event, notification and feed status updated", "PASS"],
    ["TC-ENG-31", "Load 90% with the 10% reserve left", "Near Full (not Full)", "PASS"],
  ], [1400, 3000, 3960, 1000], { size: 20 }),
  H3("C. Test incident report"),
  table([
    ["ID", "Incident", "Severity", "Status"],
    ["INC-01", "Deadlock between the drill clock and API writes", "High", "Fixed"],
    ["INC-02", "Shelter Manager saw no shelter (scope not set by seed)", "High", "Fixed"],
    ["INC-03", "Shelter at 90% load shown as Full", "Medium", "Fixed"],
    ["INC-04", "Replay test depended on timing", "Low (test)", "Fixed"],
    ["INC-05", "Test sent invalid data and got 422", "Low (test)", "Fixed"],
    ["INC-06", "Map failed to load after a dependency update", "High", "Fixed"],
    ["INC-07", "Severity colours not distinguishable for colour-blind users", "Medium", "Fixed"],
    ["INC-08", "Two tests shared the ID TC-API-29", "Low (docs)", "Fixed"],
  ], [1200, 5160, 1600, 1400], { size: 20 }),
  H3("D. Test summary report"),
  table([
    ["Item", "Result"],
    ["Backend cases", "332 executed, 332 passed, 0 failed, 0 skipped (204.9 s)"],
    ["Backend line coverage", "92.7% (3977 / 4291); target 80% met"],
    ["Frontend unit tests", "10 passed"],
    ["End-to-end sweep", "9 passed (8 roles + public page), no console errors"],
    ["Feed value end to end", "Shown 1.8 s after POST /ingest, no reload"],
    ["Connection loss", "Disconnected shown; Live again 15 s later, after restart"],
    ["Map", "113 objects at 56 fps (AMD Radeon integrated GPU); 7 fps with software rendering"],
    ["Variances", "Stale state covered by unit test only; GitHub CI run pending a push"],
    ["Assessment", "All acceptance criteria pass; no open incidents"],
  ], [3000, 6360], { size: 20 }),
  H2("Conclusion"), P("Testing followed an IEEE 829 plan and was automated except for the connection-loss check. Every specified case passed on the final run, and every number above comes from that run's reports."),
];
const role = (name, text, file, cap) => [H3(name), ...bullets(text), ...(file ? [img(shot(file), { maxH: 330 }), caption(cap)] : [])];
const exp12 = [
  H1("Experiment 12 – Debugging, Documentation and Final Report"),
  H2("Objective"), P("To debug the system, document how to install and use it, record its limitations, and reflect on the project."),
  H2("Procedure"),
  ...numbered(["Logged every real defect found during the final build and testing, with cause, fix and guard test.", "Wrote the README with local and Docker setup (docker-compose with PostgreSQL, backend and frontend).", "Wrote a user manual per role with screenshots taken by the automated page sweep.", "Ran a final verification of the whole stack.", "Listed the limitations and held a retrospective."], "p12"),
  H2("Output"),
  H3("Debugging log"),
  table([
    ["ID", "Symptom", "Cause", "Fix", "Guard"],
    ["D-01", "Shelter Manager saw no shelter", "Seed created users before shelters", "Link user scopes after shelters/teams exist", "TC-API-04, 07"],
    ["D-02", "deadlock detected during drills", "Clock and requests updated rows in different orders", "One PostgreSQL advisory lock for all writers", "TC-API-27, 28"],
    ["D-03", "90% shelter shown as Full", "No plannable seats treated as Full", "Status from load with config thresholds", "TC-ENG-31, 32"],
    ["D-04", "Replay test flaky", "Compared with wall time", "Assert on the drill clock", "TC-API-24"],
    ["D-05", "Test got 422, not 403", "Invalid test data", "Valid data", "TC-API-30"],
    ["D-06", "Blank map", "@zip.js/zip.js 2.25 export change", "Pin 2.7.73; error boundary around map", "E2E sweep"],
    ["D-07", "Severity colours too close (ΔE 1.7)", "Multi-hue palette", "One-hue ramp passing CVD checks", "Validator"],
    ["D-08", "Duplicate test ID", "Reused number", "Renamed to TC-API-39", "Case table"],
    ["D-09", "Old CI never ran", "Path filter on app/** at root", "New ci.yml with working-directory", "–"],
  ], [800, 2000, 2200, 2700, 1660], { size: 18 }),
  H3("Installation (summary of the README)"),
  ...code([
    "createdb -U postgres saferoute ; createdb -U postgres saferoute_drill",
    "pip install -r backend/requirements-dev.txt",
    "cd backend && alembic upgrade head && alembic -x db=drill upgrade head",
    "python -m app.seed && uvicorn app.main:app --port 8000",
    "cd frontend && npm install && npm run dev      # http://localhost:5173",
    "# or: docker compose up --build   (written, not run: no Docker on the dev machine)",
  ]),
  H3("User manual (by role)"),
  ...role("Everyone", ["Top bar: LIVE / DRILL / REPLAY (which data you see), the operation clock T+n, the connection state (Live, Stale, Disconnected; it reconnects by itself), and notifications.", "The map: shelters as capacity rings (solid = present, lighter = on the way, colour = status), zones shaded by severity, routes styled by status (blocked/flooded red dashed), moving vehicles. Click anything for details."], "evacuation-coordinator/dashboard.png", "Command Dashboard (Evacuation Coordinator)"),
  ...role("Evacuation Coordinator", ["Allocation Plan: choose Greedy or Min-Cost Flow, Generate plan, open “Why” for the cost and rejected alternatives, Approve, or override a row with a reason.", "Plan Versions: what changed in each re-plan. Drill: start on a copy of live data, inject events, end and return to live."], "evacuation-coordinator/plan.png", "Allocation Plan"),
  ...role("Emergency Authority", ["Everything the Coordinator can do for plans and drills, plus disasters and zones, rescue teams, resources, and the Audit & Notifications log."], "emergency-authority/audit.png", "Audit & Notifications"),
  ...role("Shelter Manager", ["Shelter Check-in for your own shelter: check in by token, register walk-ins (10% reserve), family reunification search. Change shelter status and facilities; closing or losing a facility proposes a new plan."], "shelter-manager/checkin.png", "Shelter Check-in"),
  ...role("Transport Coordinator", ["Routes: add a route through named roads and change its status; Blocked or Flooded re-plans every group using it. Vehicles & Teams: add vehicles, change status, follow one on the map."], null),
  ...role("Response Team", ["Field Team: tasks in order; tick families as they board or Mark all picked up, then Arrived at shelter. Works on a phone; offline actions are queued and sent later."], "response-team/field.png", "Field Team"),
  ...role("Relief Staff, NGO Volunteer, Administrator, Public", ["Relief Staff and NGO Volunteer: read-only dashboard, plan and lists.", "Administrator: every page and action, for setup and support.", "Public Evacuee Page (no login): enter a zone code or phone number to see the assigned shelter; English, Hindi and Tamil."], null),
  H3("Limitations"),
  ...bullets([
    "No real live feed for Chennai yet; the ingest API is ready and the development replay is labelled REPLAY.",
    "Basemap (Esri) and road geometry (OSRM) are online services; offline, the map draws data layers without basemap tiles.",
    "docker-compose was written but not run on the development machine (no Docker).",
    "CI has not yet run on GitHub (needs a push).",
    "The WebSocket hub is in memory, so several backend processes would need a shared broker.",
    "Frontend coverage is not measured; map frame rate was measured on one machine only (7 fps with software rendering).",
  ]),
  H3("Retrospective"),
  ...bullets([
    "**Went well:** the pure engine was the easiest part to test (98.8% coverage) and to explain in the UI; API tests on real PostgreSQL caught a deadlock that fakes would have hidden; generating the ER diagram and the test table from the code kept the documents accurate.",
    "**Was hard:** moving from an in-browser mock to live data touched almost every page; concurrency between the drill clock, the feed and users.",
    "**Next:** connect a real feed; run CI on GitHub and enable branch protection; measure frontend coverage.",
  ]),
  table([["Member", "Roll no.", "Contribution"], ["Bhoomika", "J240211026", "TODO (team)"], ["Akshita Upadhyay", "J240211005", "TODO (team)"], ["Neel Tripathi", "J240211049", "TODO (team)"], ["Tanishq Saxena", "J240211060", "TODO (team)"]], [3000, 2000, 4360]),
  H2("Conclusion"), P("SafeRoute meets its SRS: every functional requirement is implemented, traced and tested, the system runs on live data with one map, and the documentation explains how to install, use and maintain it. The limitations above are what remains before real use."),
];

// ---------- Appendix A: implementation addenda for Exp 1-5 ----------
const appA = [
  H1("Appendix A – Implementation Addenda to Experiments 1–5"),
  P("Experiments 1–5 above are the original design, unchanged except for the typo fixes in Appendix B. This appendix records how that design was implemented. The diagrams are PlantUML sources in docs/uml, rendered locally."),
  H2("A.1 Traceability matrix (Experiments 1–2)"),
  table([
    ["FR", "Use case", "Service / engine", "Endpoint(s)", "Table(s)", "Tests"],
    ["FR-01", "Manage disasters", "catalog.create/update_disaster", "/disasters", "disasters", "TC-API-09, 35"],
    ["FR-02", "Register zones", "catalog.create/update_zone", "/zones", "affected_zones, households", "TC-API-09, 10, 37"],
    ["FR-03", "Manage shelters", "catalog shelter functions; engine/status.py", "/shelters, …/status, …/facilities, …/checkin", "shelters, shelter_facilities", "TC-API-19, 29, 31; TC-ENG-31, 32; TC-SVC-06, 07"],
    ["FR-04", "Route status", "catalog.create_route, transition_route", "/routes, …/status", "routes, road_segments, route_segments", "TC-API-13, 14, 32; TC-SVC-04, 05"],
    ["FR-05", "Vehicles & teams", "catalog vehicle/team functions", "/vehicles, /rescue-teams", "vehicles, rescue_teams", "TC-API-33, 34"],
    ["FR-06", "Generate plan", "engine/priority.py", "POST /evacuations/generate", "affected_zones, households", "TC-ENG-10..14"],
    ["FR-07", "Generate plan", "engine/allocate.py, cost.py", "POST /evacuations/generate", "shelters, routes, vehicles", "TC-ENG-01..06, 15..17, 21..23; TC-API-11"],
    ["FR-08", "Explain choice", "engine/cost.py, PlanningConfig", "/evacuations/generate, /compare", "plan_versions", "TC-ENG-07..09, 19, 20; TC-API-17"],
    ["FR-09", "Generate plan", "dispatch_vehicles, allocate_resources", "/evacuations/assignments, /resource-allocations", "evacuation_assignments, vehicle_assignments, resource_allocations", "TC-API-18, 20; TC-ENG-34..36"],
    ["FR-10", "Reallocate", "planning.replan; engine/replan.py, diff.py", "…/status, /evacuations/reallocate, /ingest", "plan_versions, plan_version_assignments", "TC-ENG-24..30; TC-API-12, 13, 22; TC-SVC-01, 04"],
    ["FR-11", "Log in", "core/rbac.py, api/deps.py", "/auth/login, every protected route", "users", "TC-API-01..08; TC-SVC-03"],
    ["FR-12", "Audit", "services/logbook.py", "/logs/audit, /notifications", "audit_logs, notifications", "TC-API-12, 38; TC-SVC-01, 09"],
  ], [700, 1300, 2000, 2000, 1800, 1560], { size: 16 }),
  P("Interview answers are not reported. TODO (team): if interviews were held, add who was asked and what changed because of them."),
  H2("A.2 UML of the built system (Experiment 3)"),
  img(uml("use-case.png"), { maxH: 520 }), caption("Use case diagram (docs/uml/use-case.puml)"),
  img(uml("class.png"), { maxH: 640 }), caption("Class diagram (docs/uml/class.puml); attribute names checked against the models"),
  img(uml("activity.png"), { maxH: 760 }), caption("Activity diagram – generate evacuation plan (docs/uml/activity.puml)"),
  img(uml("sequence.png"), { maxH: 520 }), caption("Sequence diagram – create evacuation plan (docs/uml/sequence.puml)"),
  H3("Design changes since the original diagrams"),
  table([
    ["Change", "Why"],
    ["Household and HouseholdMember", "FR-06 needs vulnerable people per family; check-in and lookup work per family; a family is never split"],
    ["PlanVersion (+ plan_version_assignments)", "FR-10: each re-plan is a new Proposed version with a diff, approved by a person"],
    ["ShelterFacility table instead of a Facilities attribute", "1NF; one facility can become Limited or Unavailable and drive re-planning"],
    ["RoadSegment / route_segments", "Several routes cross the same bridge; one report blocks all of them"],
    ["Route keyed by zone_id and shelter_id", "Allocation needs the route between a specific zone and shelter"],
    ["VehicleAssignment, RescueTeam, ResourceAllocation, AssignmentHousehold", "FR-05 and FR-09: which vehicles carry which families; which supplies go where"],
    ["Notification linked to its AuditLog entry", "FR-12: an alert can be traced to the action behind it"],
    ["Relief Staff and NGO Volunteer roles (read-only)", "Stakeholders in the SRS"],
    ["OpsState, OpsEvent, IngestLog; separate drill database", "Live operation, the event log, feed records; drills never change live data"],
  ], [3600, 5760], { size: 20 }),
  H2("A.3 Architecture as built (Experiment 4)"),
  img(uml("architecture.png"), { maxH: 600 }), caption("Layered architecture (docs/uml/architecture.puml)"),
  table([
    ["Layer", "Folder", "Responsibility"],
    ["Presentation", "frontend/src/features, components", "Pages per role, CesiumJS map, forms"],
    ["Client store", "frontend/src/hooks/queries.ts, src/api", "Query cache fed by REST, refreshed on WebSocket messages; zod validation"],
    ["API", "backend/app/api", "REST routers, /ws, JWT and role checks, commit then publish"],
    ["Ingestion", "backend/app/ingestion", "Validates feed messages and applies them through services"],
    ["Services", "backend/app/services", "Use cases: planning, catalog, operations, drills, views, audit"],
    ["Engine", "backend/app/engine", "Pure Python decisions; no database or HTTP imports"],
    ["Data access", "backend/app/repositories, models", "Repositories over SQLAlchemy models"],
    ["Database", "PostgreSQL 16 (live + drill)", "Source of truth; schema by Alembic"],
  ], [1800, 3200, 4360], { size: 20 }),
  H2("A.4 Database as built (Experiment 5)"),
  P("The schema was created with Alembic migrations (0001_initial_schema, 0002_household_arrived_minute) and exported with pg_dump to docs/db/schema.sql: 25 application tables and 50 CHECK constraints. The ER diagram below is generated from the SQLAlchemy models by docs/uml/gen_er.py, so it matches the database."),
  img(uml("er.png"), { maxH: 800 }), caption("ER diagram generated from the models (full size: docs/uml/out/er.svg)"),
  table([
    ["Rule from Experiment 5", "Constraint in PostgreSQL"],
    ["Capacity > 0", "chk_shelter_capacity_positive CHECK (capacity > 0)"],
    ["Occupancy ≥ 0", "chk_shelter_occupancy_non_negative CHECK (current_occupancy >= 0)"],
    ["Occupancy must not exceed capacity", "chk_shelter_occupancy_lte_capacity CHECK (current_occupancy <= capacity)"],
    ["People_Count > 0", "chk_assignment_people_count_positive CHECK (people_count > 0)"],
    ["Assignments reference valid zones and shelters", "Foreign keys evacuation_assignments.zone_id, shelter_id, route_id"],
    ["UNIQUE", "users.email, households.token, (plan_id, version) on plan_versions"],
  ], [3600, 5760], { size: 20 }),
  H3("Normalization"),
  ...bullets([
    "**1NF:** one value per field. Shelter facilities became the shelter_facilities table (one row per facility with its own availability); household members are rows, not a list column.",
    "**2NF:** link tables with composite keys (plan_version_assignments, assignment_households) hold only the link; facts about an assignment depend on assignment_id alone.",
    "**3NF:** an assignment stores shelter_id, not the shelter's name or capacity, so renaming a shelter is one update. The displayed shelter status is computed from occupancy and thresholds, not stored twice.",
    "**Deliberate exceptions:** plan_versions.metrics and diff are JSON snapshots of history that must not change later; routes keep source/destination display text next to their keys.",
  ]),
  P("Seed data is loaded by python -m app.seed; its data module is labelled “SEED DATA – not live data”."),
];
const appB = [
  H1("Appendix B – Changes to the Original File (Pages 1–16)"),
  P("The content of the cover, team page, project overview and Experiments 1–5 is unchanged except for the corrections below. Pages were re-typeset in the same font and footer, so page breaks differ from the original."),
  table([
    ["Where", "Original", "Now", "Reason"],
    ["Index", "Rows for Experiments 1–5", "Rows for Experiments 1–12", "Lab file now covers all experiments"],
    ["Index, Experiment 2", "Software RequSpecification (SRS)", "Software Requirements Specification (SRS)", "Typo"],
    ["Experiment 5, A", "…on page 4 (no full stop)", "…on page 4.", "Punctuation"],
    ["Experiment 5, E", "4 .Separate tables…", "4. Separate tables…", "Typo"],
    ["Experiment 1, Project Charter", "Heading in table style", "Same heading as body sub-heading", "Formatting only"],
  ], [2200, 2600, 2600, 1960], { size: 20 }),
  P("Experiments 6–12 and Appendix A are new. Their sources are in the repository: docs/exp06 … docs/exp12, docs/uml, docs/db/schema.sql, docs/exp11/test-cases.md and docs/exp12/verification-log.txt."),
];

// ---------- document ----------
const footer = new Footer({
  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("SafeRoute – Software Engineering Lab | Page ", { size: 22 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })],
});
const numRefs = ["q", "r5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"];
const doc = new Document({
  creator: "SafeRoute team",
  title: "SafeRoute – Software Engineering Lab File",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 32, bold: true }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ...numRefs.map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] })),
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, footer: 600 } } },
    footers: { default: footer },
    children: [...cover, ...team, ...index, ...overview, ...exp1, ...exp2, ...exp3, ...exp4, ...exp5, ...exp6, ...exp7, ...exp8, ...exp9, ...exp10, ...exp11, ...exp12, ...appA, ...appB],
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length, "bytes"); });
