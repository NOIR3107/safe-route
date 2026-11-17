# Experiment 8 – Unit Testing

## Objective

To write automated unit tests for the core logic, with at least 80% line coverage of the backend, and
to test the frontend's own logic.

## Procedure

1. Split tests by layer, matching the architecture (Experiment 4):
   * `backend/tests/engine`: the pure engine (priority, feasibility, ranking, allocation, re-plan,
     diff, status, geometry). No database.
   * `backend/tests/services`: service rules with fake repositories (`tests/services/fakes.py`).
     No database.
   * `backend/tests/api`: API integration tests on a real PostgreSQL test database, migrated with
     Alembic for every session, so the migrations are tested too.
   * `frontend/src/**/*.test.ts`: Vitest for connection state, refetch routing and map styling.
2. Named every test with an ID, `TC-<AREA>-<NN>`, kept in the function name (`test_eng18_...`), so
   reports and documents point at the same test.
3. Used properties as well as examples where the engine allows it: capacity is never exceeded, hard
   constraints always hold, every household is placed once and never split, and the same input gives the
   same output.
4. Ran with coverage:
   ```bash
   cd backend
   pytest --cov=app --cov-report=term --cov-report=xml:reports/coverage.xml --junitxml=reports/junit.xml
   cd ../frontend && npx vitest run
   ```

## Output

### Results (run on 17 Nov 2026, Python 3.12.10, PostgreSQL 16.6)

| Suite | Test functions | Executed cases | Passed | Time |
|---|---:|---:|---:|---:|
| Backend engine (TC-ENG-01..36) | 36 | see table | all | – |
| Backend services (TC-SVC-01..09) | 9 | 9 | 9 | – |
| Backend API (TC-API-01..39) | 39 | see table | all | – |
| **Backend total** | **84** | **332** | **332** | 204.9 s |
| Frontend Vitest (TC-UI-01..10) | 10 | 10 | 10 | 0.5 s |

Parametrized tests run once per parameter. For example, TC-API-05 checks seven role/endpoint pairs, so
84 functions give 332 executed cases. Per-test results: [test-cases.md](../exp11/test-cases.md).

### Coverage (backend, line coverage, from `reports/coverage.xml`)

| Layer | Covered / lines | Coverage |
|---|---:|---:|
| engine | 713 / 722 | 98.8% |
| api | 492 / 518 | 95.0% |
| repositories | 214 / 225 | 95.1% |
| services | 1160 / 1317 | 88.1% |
| core | 136 / 156 | 87.2% |
| ingestion | 145 / 178 | 81.5% |
| seed | 198 / 253 | 78.3% |
| models, schemas | 889 / 889 | 100% |
| `main.py` | 30 / 33 | 90.9% |
| **Total** | **3977 / 4291** | **92.7%** |

The target was 80%; CI fails the build below it (`--cov-fail-under=80`). The least covered files are
`ingestion/osrm.py` (it calls the external OSRM service, so the tests use its recorded output instead),
`ingestion/replay.py` (development fallback), and `seed/__main__.py` (command-line wrapper).

Frontend line coverage is not measured: `@vitest/coverage-v8` is not installed. The frontend is covered
behaviourally by the Playwright sweep in [Experiment 11](../exp11/exp-11.md).

### Example tests

```python
def test_eng18_engine_is_deterministic():          # same input -> identical plan
def test_eng15_capacity_is_never_exceeded():        # property over generated scenarios
def test_svc02_illegal_transition_is_rejected_and_nothing_is_written(): # fake repos record no writes
def test_api12_...():                               # close a shelter -> new Proposed version + audit
```

## Conclusion

The backend has 332 passing test cases and 92.7% line coverage, above the 80% target. The engine,
which makes the decisions, is the best covered layer at 98.8%.
