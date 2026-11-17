# Experiment 11 – Test Plan, Test Cases and Test Report (IEEE 829)

## Objective

To plan the testing of SafeRoute in the IEEE 829 format, specify the test cases, and report the results
of a real test run.

## Procedure

1. Wrote the test plan (section A).
2. Specified the test cases as automated tests with IDs; the case table is generated from the source
   and the JUnit result ([gen_cases.py](gen_cases.py) → [test-cases.md](test-cases.md)).
3. Ran the backend suite, the frontend unit tests, the Playwright sweep of every page for every role, and
   the manual verification run ([verification-log.txt](../exp12/verification-log.txt)).
4. Wrote the incident and summary reports (sections C and D) from those outputs.

## Output

### A. Test plan

| IEEE 829 item | SafeRoute |
|---|---|
| **Plan identifier** | SR-TP-01 |
| **Introduction** | Tests SafeRoute against SRS FR-01..FR-12 and the five acceptance criteria ([Exp 2](../exp02/exp-02.md)). |
| **Test items** | Backend `backend/app` (engine, services, repositories, API, ingestion, WebSocket); frontend `frontend/src`; PostgreSQL schema and migrations. |
| **Features to be tested** | FR-01..FR-12; live data (ingest, push, connection states); drills on a copy; RBAC for all 8 roles; shelter status thresholds. |
| **Features not to be tested** | Real disaster feeds (none available; recorded sample used); OSRM availability (recorded geometry used); load beyond the seeded scenario; mobile devices other than browser emulation. |
| **Approach** | Unit tests of the pure engine; service tests with fake repositories; API integration tests on PostgreSQL; frontend unit tests (Vitest); end-to-end sweep (Playwright) of every page for every role failing on any console error; one manual end-to-end trace of a feed value and a connection-loss test. |
| **Item pass/fail criteria** | A case passes when all its assertions hold. The run passes when every case passes, backend line coverage ≥ 80%, and no page logs a console error. |
| **Suspension / resumption** | Suspend if the test database cannot be migrated (all API tests would fail for one reason); resume after the migration is fixed. |
| **Test deliverables** | This plan; [test-cases.md](test-cases.md); `backend/reports/junit.xml`, `coverage.xml`; `frontend/reports/vitest-junit.xml`; per-role screenshots in `docs/screenshots`; this report. |
| **Testing tasks** | Write tests with each feature → run locally → run in CI on every PR → fix → re-run. |
| **Environment** | Windows 11, Python 3.12.10, PostgreSQL 16.6, Node 24.20.0, Chromium (Playwright). CI: ubuntu-latest, postgres:16, Python 3.12, Node 22. |
| **Responsibilities** | TODO (team): who owns which suite. |
| **Schedule** | Tests written alongside each module; full run before each merge. |
| **Risks** | Timing-dependent drill tests (mitigated by asserting on the drill clock, not wall time); WebGL-dependent map in headless CI (software rendering is slow, so the map is checked for errors, not frame rate). |
| **Approvals** | TODO (team). |

### B. Test case specification

The full table of 84 test functions (332 executed cases) with ID, purpose, file, requirement and result
is in **[test-cases.md](test-cases.md)**. Summary by area:

| Area | IDs | Level | What it covers |
|---|---|---|---|
| Engine | TC-ENG-01..36 | Unit | Feasibility, ranking, priority, allocation properties, vehicle constraint, re-plan, diff, status thresholds, geometry |
| Services | TC-SVC-01..09 | Unit (fakes) | Status transitions, scoping, re-plan triggers, approvals and audit |
| API | TC-API-01..39 | Integration (PostgreSQL) | Auth and RBAC, the lab's full flow, CRUD, ingestion, WebSocket, drills, timeline |
| Frontend | TC-UI-01..10 | Unit (Vitest) | Connection states, refetch routing, shelter ring and route styles |
| End to end | `e2e/pages.spec.ts` | System (Playwright) | Every page for each of the 8 roles and the public page; zero console errors |

Example case specifications:

| ID | Input | Expected | Actual |
|---|---|---|---|
| TC-ENG-02 | A shelter reachable only by a Blocked (then a Flooded) route | Infeasible; the reason names the route status | As expected – PASS |
| TC-API-12 | Coordinator closes Guindy School, which has assignments | Shelter shows Closed; plan v2 Proposed, trigger ShelterClosed; every affected person moved or reported unallocated; nothing still heading there; a "REPLANNING v2" notification | As expected – PASS |
| TC-API-07 | Shelter Manager (T. Nagar) updates another shelter | 403 | As expected – PASS |
| TC-API-22 | `POST /ingest` route_status Flooded for a named segment | Routes over that segment Flooded; event, notification, feed status updated | As expected – PASS |
| TC-ENG-31 | Load 90% with the 10% reserve left | "Near Full" (not "Full") | As expected – PASS |

### C. Test incident report

Incidents found while testing, all fixed before the final run. Details in the
[debugging log](../exp12/debugging-log.md).

| ID | Found by | Incident | Severity | Status |
|---|---|---|---|---|
| INC-01 | API tests during drills | Deadlock between the drill clock and API writes | High | Fixed (advisory lock) |
| INC-02 | Manual run as Shelter Manager | Shelter Manager saw no shelter (scope not set by seed) | High | Fixed |
| INC-03 | UI review | Shelter at 90% load shown as Full | Medium | Fixed (TC-ENG-31) |
| INC-04 | TC-API-24 | Result depended on timing of replay vs. clock | Low (test) | Fixed |
| INC-05 | TC-API-30 | Test sent invalid data (location too short), got 422 | Low (test) | Fixed test data |
| INC-06 | Browser | Map failed to load after a dependency update (`@zip.js/zip.js` export change) | High | Fixed (version pinned) |
| INC-07 | Palette validator | Severity colours not distinguishable for colour-blind users (adjacent ΔE 1.7) | Medium | Fixed (one-hue ramp, passes) |
| INC-08 | Report generation | Two different tests both named TC-API-29 | Low (docs) | Fixed (second one is TC-API-39) |

### D. Test summary report

| Item | Result |
|---|---|
| Backend cases | **332 executed, 332 passed, 0 failed, 0 skipped** (204.9 s) |
| Backend line coverage | **92.7%** (3977 / 4291 lines); target 80% met |
| Frontend unit tests | **10 passed** |
| End-to-end sweep | **9 passed** (8 roles + public page), no console errors (6.7 min) |
| Feed value end to end | Shown in the UI **1.8 s** after `POST /ingest`, without a reload |
| Connection loss | Disconnected shown when the backend stopped; back to Live 15 s later, without a reload, after restart |
| Map | 113 objects at **56 fps** on the test machine's GPU (AMD Radeon integrated, D3D11); 7 fps with software rendering |
| Open incidents | None |
| Variances from plan | The *Stale* connection state was not produced in the manual run; it is covered by TC-UI-02 only. The CI run on GitHub has not happened yet ([Exp 10](../exp10/exp-10.md)). |
| Assessment | All acceptance criteria pass. The system meets the pass criteria of this plan. |

## Conclusion

Testing followed an IEEE 829 plan and was fully automated except for the connection-loss check. Every
specified case passed on the final run, and the numbers above come from that run's reports.
