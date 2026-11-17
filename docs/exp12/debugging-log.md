# Debugging log

Real defects found while building and testing the final version, in the order they were found. Each
entry has the symptom, the cause, the fix, and the test that guards it.

### D-01 Shelter Manager saw no shelter
* **Symptom:** after a fresh seed, the Shelter Manager's check-in page was empty, and every action
  returned 403.
* **Cause:** the seed created users before shelters and teams, so `users.shelter_id` and `team_id` stayed
  NULL.
* **Fix:** `seed/loader.py` links user scopes after shelters and teams exist.
* **Guard:** TC-API-04 (scope returned by `/auth/me`), TC-API-07.

### D-02 Deadlock between the drill clock and API writes
* **Symptom:** during a running drill, some writes failed with PostgreSQL `deadlock detected`.
* **Cause:** the clock loop and request handlers updated the same rows (ops_state, assignments,
  vehicles) in different orders.
* **Fix:** every writer takes one PostgreSQL advisory transaction lock first
  (`core/database.py: serialize_writes`, used by API writes, the clock tick, ingestion, replay and drill
  restore). Reads never wait.
* **Guard:** TC-API-27 and TC-API-28 run drills alongside API writes.

### D-03 A shelter at 90% was shown as "Full"
* **Symptom:** a shelter with 90% of its capacity present or inbound showed **Full**, although its 10%
  walk-in reserve was still free.
* **Cause:** status treated "no plannable seats" as Full.
* **Fix:** `engine/status.py: shelter_display_status`. Load = (present + inbound) / capacity; Near Full
  from 0.75 and Full from 1.0, both thresholds in `PlanningConfig`.
* **Guard:** TC-ENG-31 (the 90% case is a parameter), TC-ENG-32.

### D-04 Replay test depended on timing
* **Symptom:** TC-API-24 passed or failed depending on machine speed.
* **Cause:** the test compared replay progress with wall time while the drill clock was also running.
* **Fix:** the test advances the drill clock to a known minute and asserts on `sim_minute` and on which
  scripted events have fired.
* **Guard:** the test itself; 332/332 on the final run.

### D-05 API test sent invalid data
* **Symptom:** TC-API-30 got 422 instead of the expected 403.
* **Cause:** the request body had a location shorter than the schema's minimum, so validation failed
  before the role check.
* **Fix:** valid test data; the test now checks only the role rule.

### D-06 Map did not load after a dependency update
* **Symptom:** blank map; Vite reported an export error inside CesiumJS's pre-bundle.
* **Cause:** `@zip.js/zip.js` 2.25 changed its exports; CesiumJS 1.123 imports the old ones.
* **Fix:** npm `overrides` pins `@zip.js/zip.js` to 2.7.73. Cesium is listed in `optimizeDeps.include`,
  and an error boundary around the map keeps the rest of the page working if the map fails.
* **Guard:** the Playwright sweep fails on any console or page error.

### D-07 Severity colours not distinguishable for colour-blind users
* **Symptom:** the palette validator reported adjacent severity steps only 1.7 apart (ΔE) under
  colour-vision-deficiency simulation.
* **Fix:** a one-hue ramp, light → dark in light mode and dark → light in dark mode, that passes the
  ordinal checks in both themes. Severity also always shows its number (Sev 1–5).

### D-08 Two tests shared one ID
* **Symptom:** the generated test-case table listed TC-API-29 twice.
* **Cause:** a test added later in `test_live_data.py` reused the number.
* **Fix:** renamed it to TC-API-39.

### D-09 Old CI workflows tested nothing
* **Symptom:** the old `backend-ci.yml` filtered on `app/**` at the repository root, and the backend
  had moved to `backend/`, so the workflow never triggered.
* **Fix:** one `ci.yml` with a PostgreSQL service and `working-directory: backend` ([Exp 10](../exp10/exp-10.md)).
