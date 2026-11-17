# Experiment 1 – Problem Selection, Feasibility Study & Project Charter

## Objective

To identify a real-world software problem, assess its feasibility, define the project scope, and prepare a
brief project charter.

## Procedure

1. Listed problems where coordination software can help after an incident has been declared, and chose
   disaster evacuation and shelter allocation.
2. Wrote the problem statement and the proposed solution.
3. Assessed technical, economic, operational and schedule feasibility.
4. Prepared the project charter: goal, users, scope, out of scope, deliverable.

## Output

### Problem statement

During disasters, emergency authorities must coordinate affected populations, shelters, evacuation routes,
vehicles, and response teams while conditions may change rapidly. Manual coordination can make it difficult
to allocate people to suitable shelters and re-plan evacuation when a route is blocked or a shelter becomes
unavailable.

### Proposed solution

SafeRoute will maintain disaster, affected-zone, shelter, route, vehicle, and response-team data and use a
constraint-based allocation engine to generate and dynamically update evacuation plans.

### Feasibility study

| Feasibility | Assessment |
|---|---|
| Technical | Feasible using Python/FastAPI, React, PostgreSQL, GitHub and PyTest. No specialized hardware is required. |
| Economic | The proposed stack is open-source and suitable for an academic prototype. |
| Operational | The system supports emergency, shelter, transport and response roles through role-based access. |
| Schedule | The system can be developed incrementally from requirements through testing and CI. |

### Project charter

| Item | Description |
|---|---|
| Project | SafeRoute – Disaster Evacuation & Shelter Allocation System |
| Goal | Provide decision support for evacuation planning and resource allocation. |
| Primary users | Emergency authority, evacuation coordinator, shelter manager, transport coordinator, response teams, administrator. |
| Scope | Disaster, zone, shelter, route, resource, allocation, dashboard, authentication, alerts and audit. |
| Out of scope | Disaster prediction, autonomous vehicle control, physical traffic control and guaranteed real-world emergency dispatch. |
| Key deliverable | Working web prototype with documented design, tests, Git workflow and CI. |

### Stakeholders

Emergency Management Authority, Evacuation Coordinator, Shelter Manager, Transportation Coordinator,
Rescue/Response Team, Medical/Relief Personnel, NGOs/Volunteers, System Administrator.

### How the built system matches the charter

* Every scope item exists in the running system. [Experiment 2](../exp02/exp-02.md#traceability-matrix)
  traces each requirement to code and tests.
* The out-of-scope items are still out: SafeRoute predicts nothing, controls no vehicles and dispatches
  nothing by itself. A person approves every plan version.
* The deliverable exists: web prototype, design documents, 332 automated backend test cases, Git
  workflow and a CI pipeline (Experiments 3–12).

## Conclusion

The problem is relevant, and an open-source web stack can solve it without special hardware. The
charter fixed the scope that the later experiments design, build and test.
