# Experiment 1 – Problem selection, feasibility study and project charter

## Problem statement

During a flood, cyclone or industrial fire, the people running an evacuation have to keep track of
affected areas, shelters, roads, vehicles and rescue teams at the same time, and the picture keeps
changing. A bridge goes under water, a shelter fills up, a generator fails. Doing this on phones and
spreadsheets makes it hard to answer the basic question: *who should go where, by which road, in which
vehicle, right now?* It is even harder to re-plan quickly when something breaks.

## What we are building

SafeRoute is a web-based decision-support system. It keeps the disaster, zone, shelter, route,
vehicle and team data in one place. A constraint-based allocation engine proposes an evacuation plan,
and the engine re-plans when a road or shelter becomes unavailable. A human coordinator always
approves or overrides the plan, so the system advises and does not decide on its own.

SafeRoute does **not** try to predict disasters. It starts once an incident has been declared.

## Feasibility

| Type | Assessment |
|---|---|
| Technical | Feasible with Python/FastAPI, React, PostgreSQL (SQLite for local dev), GitHub and PyTest. No special hardware needed. Maps use OpenStreetMap tiles. |
| Economic | Everything we use is open source or free tier. The 3D globe (god's-eye-view) runs keyless; optional keys are not needed for the demo. |
| Operational | Separate roles (authority, coordinator, shelter manager, transport, field team, admin) match how evacuations are actually run. The field view works offline. |
| Schedule | Built incrementally over the semester: requirements → design → backend → frontend → tests → CI → demo. |

## Project charter

| Item | Description |
|---|---|
| Project | SafeRoute – Disaster Evacuation & Shelter Allocation System |
| Goal | Decision support for evacuation planning and resource allocation |
| Primary users | Emergency authority, evacuation coordinator, shelter manager, transport coordinator, response teams, administrator; evacuees through a public page |
| In scope | Disasters and zones, shelters, routes, vehicles/teams, allocation, re-planning, dashboard, auth/RBAC, notifications and audit, drills |
| Out of scope | Disaster prediction, autonomous vehicle control, physical traffic control, guaranteed real-world dispatch |
| Key deliverable | Working web prototype with design documents, tests, Git workflow and CI |

## Stakeholders (initial list)

Emergency management authority · evacuation coordinator · shelter manager · transport coordinator ·
rescue/response teams · medical and relief staff · NGOs and volunteers · system administrator ·
evacuees and their families.

## Team

| Name | Roll no. |
|---|---|
| Bhoomika | J240211026 |
| Akshita Upadhyay | J240211005 |
| Neel Tripathi | J240211049 |
| Tanishq Saxena | J240211060 |
