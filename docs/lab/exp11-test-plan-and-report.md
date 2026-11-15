# Experiment 11 – Test plan, test cases and test report

## 1. Scope

**In scope:** authentication and RBAC, disaster/zone/shelter/route/vehicle management, priority and
allocation engines, re-planning, audit and notifications (FR-01 to FR-12), the main frontend flows, the
offline field view, and the god's-eye-view integration.

**Out of scope:** load testing beyond the seeded scenario, real GPS/vehicle hardware, third-party
services used by god's-eye-view, production deployment.

## 2. Approach

| Level | Tool | What |
|---|---|---|
| Unit | PyTest, Vitest | Engines (priority, constraints, scoring, allocation, re-planning, diff), adapters |
| API integration | PyTest + `TestClient`, in-memory SQLite | Endpoints, RBAC, validation, audit side effects |
| Service integration | Vitest on the mock service | Whole demo flow without a browser |
| System / UI | Playwright (Chromium) | Real browser, demo flow, RBAC screens, i18n, console errors |
| Manual | Browser + phone width | Look and feel, offline PWA, 3D globe |

**Entry criteria:** code compiles (`tsc`), lint is clean, the backend starts.
**Exit criteria:** all automated tests pass, no open "high" defects, every FR has at least one passing test.

**Environment:** Windows 11, Python 3.12.10, Node 24.20, Chromium (Playwright 1.65), SQLite in memory
for tests. CI: GitHub Actions, `ubuntu-latest`.

## 3. Requirement → test mapping

| FR | Covered by |
|---|---|
| FR-01 disasters | `test_create_and_read_disaster`, `test_create_disaster_roles[*]` |
| FR-02 zones | `test_register_affected_zone`, demo flow seed test |
| FR-03 shelters | `test_create_shelter_and_facility`, `protects the walk-in reserve`, check-in test |
| FR-04 routes | `test_create_and_update_route`, `test_flooded_route_is_never_chosen` |
| FR-05 vehicles/teams | `test_end_to_end_evacuation_workflow`, `prefers ambulances for medical groups…` |
| FR-06 priority | `test_priority_engine_ranking`, `test_priority_score_formula`, TS parity test |
| FR-07 hard constraints | `test_hard_constraint_excludes_blocked_route_and_full_shelter`, `evaluateEdge – hard constraints` (5 tests) |
| FR-08 ranking | `test_suitability_prefers_capacity_and_short_trips`, `routeCost` (5 tests) |
| FR-09 assignments | `test_population_split_across_shelters_respects_capacity`, `allocate.test.ts` (11 tests) |
| FR-10 re-planning | `test_dynamic_reallocation_on_route_blockage`, `test_route_blocked_moves_people_to_other_shelter`, `test_full_shelter_triggers_move`, `replan.test.ts`, e2e demo flow |
| FR-11 RBAC | `test_rbac.py` (13 tests), demo-flow RBAC tests, e2e shelter-manager test |
| FR-12 audit/notifications | `test_reallocation_is_audited_and_notified`, `test_audit_log_restricted_to_admin_and_authority`, e2e audit check |

## 4. Test cases

Status: ✅ pass (automated run on 15 Nov 2026), 🖐 manual check.

| ID | FR | Test case | Steps / input | Expected result | Actual | Status |
|---|---|---|---|---|---|---|
| TC-01 | FR-11 | Login with valid credentials | POST `/auth/login/json` with a registered user | 200, bearer token, role returned | as expected | ✅ |
| TC-02 | FR-11 | Login with wrong password | wrong password | 401 "Incorrect email or password" | as expected | ✅ |
| TC-03 | FR-11 | Call protected endpoint without token | POST `/disasters/` with no header | 401 | as expected | ✅ |
| TC-04 | FR-11 | Shelter Manager creates a disaster | Shelter Manager token | 403 | as expected | ✅ |
| TC-05 | FR-11 | Inactive user uses an old token | set `is_active=False`, call `/auth/me` | 400 "Inactive user" | as expected | ✅ |
| TC-06 | FR-01 | Create and read a disaster | Coordinator posts a flood, then GETs it | 201 then 200 with same data | as expected | ✅ |
| TC-07 | FR-02 | Register a zone | zone with population 120, P1, Extreme | 201, status Pending | as expected | ✅ |
| TC-08 | FR-03 | Shelter with capacity 0 | POST `/shelters/` capacity 0 | 422 validation error | as expected | ✅ |
| TC-09 | FR-04 | Route with negative distance | distance_km −1 | 422 | as expected | ✅ |
| TC-10 | FR-04 | Update route to Blocked | PUT status Blocked, risk Severe | 200, status Blocked | as expected | ✅ |
| TC-11 | FR-06 | Priority score value | zone pop 600, evacuated 100, High, P1, Critical | score 0.855 (same in Python and TS) | 0.855 | ✅ |
| TC-12 | FR-06 | Fully evacuated zone | population = evacuated | score 0 | 0 | ✅ |
| TC-13 | FR-07 | Only route is flooded | one Flooded route to the shelter | shelter excluded, reason "flooded" shown | as expected | ✅ |
| TC-14 | FR-07 | Medical household, shelter without medical | 2 shelters, one lacks Medical | medical group goes to the other; rejected alternative says "No medical facility" | as expected | ✅ |
| TC-15 | FR-07 | Walk-in reserve | capacity 100, committed 85, reserve 10 | only 5 places plannable | 5 | ✅ |
| TC-16 | FR-08 | Severity weighting | same 20-min route, severity 1–5 | cost = 20 × {1, 1.25, 1.5, 2, 2.5} | as expected | ✅ |
| TC-17 | FR-09 | Population larger than one shelter | 150 people, shelters of 60 and 200 | split across both, no shelter over capacity | as expected | ✅ |
| TC-18 | FR-09 | Households never split | 9 households, two shelters | every household appears exactly once | as expected | ✅ |
| TC-19 | FR-09 | Min-Cost Flow vs Greedy | fixture where greedy is short-sighted | MCF total cost lower | lower | ✅ |
| TC-20 | FR-09 | Capacity shortage | 30 people, 20 places | 10 reported unallocated with reason | as expected | ✅ |
| TC-21 | FR-10 | Route blocked via API | generate plan, POST `/reallocate` with blocked route | people moved to the other shelter; old assignment Rerouted | as expected | ✅ |
| TC-22 | FR-10 | Shelter full via API | POST `/reallocate` with full shelter | assignments moved | as expected | ✅ |
| TC-23 | FR-10 | Only affected assignments change | block one route in a drill | assignments on other routes keep their ids | as expected | ✅ |
| TC-24 | FR-10 | Re-plan unknown plan | plan_id 9999 | 400 | as expected | ✅ |
| TC-25 | FR-12 | Re-allocation is audited | after TC-21, GET `/logs/audit` | `DYNAMIC_REALLOCATION` with the reason; CRITICAL notification | as expected | ✅ |
| TC-26 | FR-12 | Audit log access | Coordinator vs Admin vs Authority | 403 / 200 / 200 | as expected | ✅ |
| TC-27 | FR-10, 12 | Override needs a reason | override with reason "x" | 422; with a proper reason → new version + `ASSIGNMENT_OVERRIDE` audit row | as expected | ✅ |
| TC-28 | UI | Full demo flow in the browser | Playwright `coordinator demo flow` | all steps work, no console errors | 7.4 s, 0 errors | ✅ |
| TC-29 | UI, FR-11 | Shelter manager scope | log in as Shelter Manager, open `/plan`, `/shelters` | "Access restricted"; only own shelter listed | as expected | ✅ |
| TC-30 | UI | Public page in Tamil | `/public`, Tamil, search `VEL` | Tamil UI, shelter result shown | as expected | ✅ |
| TC-31 | UI | Offline field view | production build, go offline, reload `/field`, tick a pickup, reconnect | tasks load offline, "1 queued", syncs to "0 queued" | as expected | 🖐 ✅ |
| TC-32 | UI | god's-eye-view embed | start GEV, open *God's Eye View (3D)*, fly to Velachery | "Connected", overlay drawn, `gev:view-applied ok: true` | as expected | ✅ |
| TC-33 | UI | Responsive + themes | 390 px width, light/dark | no overflow, readable contrast | checked on screenshots | 🖐 ✅ |

## 5. Test report

Run date: 15 November 2026, branch `feature/frontend-and-lab-docs`.

| Suite | Total | Passed | Failed | Skipped | Time |
|---|---|---|---|---|---|
| PyTest (backend) | 36 | 36 | 0 | 0 | ~10 s |
| Vitest (frontend) | 42 | 42 | 0 | 0 | ~2 s |
| Playwright (e2e) | 5 | 5 | 0 | 0 | ~90 s |
| **Total** | **83** | **83** | **0** | **0** | |

Backend line coverage: **86 %** (engines 91–100 %).

### Defects found during testing

| ID | Found by | Description | Severity | Status |
|---|---|---|---|---|
| D-01 | drill test run | Re-planned groups with no free vehicle were sent on foot, and the rebalancer estimated vehicle trips with walking time, so they never got a vehicle (some 4-hour ETAs) | High | Fixed – rebalancer uses road travel time and pools vehicles for walking groups |
| D-02 | Playwright screenshots | Drill map rendered blank tiles and the wrong zoom when its grid container resized after mount | Medium | Fixed – `ResizeObserver` + `invalidateSize()` |
| D-03 | drill run | Retrying unallocated people created empty plan versions ("v5: 0 moved") | Low | Fixed – no version if nothing changes |
| D-04 | unit test | Shelter utilisation KPI computed before the new version was registered (showed 9 %) | Medium | Fixed |
| D-05 | e2e | Zone labels overlapped on the map at city zoom | Low | Fixed – short codes (VEL · S5) |
| D-06 | GEV integration | god's-eye-view route annotations were labelled "N min walk" | Medium | Fixed – arrows instead |
| D-07 | review | Backend marks people as evacuated at plan time, not on arrival | Medium | Open – documented in `api-extensions.md` for the backend team |

### Conclusion

All 83 automated tests pass and every functional requirement has at least one passing test. One open
medium issue (D-07) is a backend semantic difference that does not affect the demo. The system meets the
exit criteria.
