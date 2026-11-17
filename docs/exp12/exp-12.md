# Experiment 12 – Debugging, Documentation and Final Report

## Objective

To debug the system, document how to install and use it, record its limitations, and reflect on the
project.

## Procedure

1. Logged every real defect found during the final build and testing, with cause, fix and guard test
   ([debugging-log.md](debugging-log.md)).
2. Wrote the README with local and Docker setup ([README](../../README.md),
   [docker-compose.yml](../../docker-compose.yml)).
3. Wrote a user manual per role, with screenshots taken by the automated page sweep
   ([user-manual.md](user-manual.md)).
4. Ran a final verification of the whole stack ([verification-log.txt](verification-log.txt)).
5. Listed limitations and held a retrospective.

## Output

### Deliverables

| Deliverable | Where |
|---|---|
| Source code | `backend/`, `frontend/` |
| Installation | [README](../../README.md) (local, tested); `docker-compose.yml` (written, not run here, see limitations) |
| User manual (per role) | [user-manual.md](user-manual.md) |
| Debugging log | [debugging-log.md](debugging-log.md) |
| Design | [UML](../uml), [schema.sql](../db/schema.sql), Experiments 3–5 |
| Tests and reports | [Exp 8](../exp08/exp-08.md), [Exp 11](../exp11/exp-11.md), [test-cases.md](../exp11/test-cases.md) |
| Screenshots | `docs/screenshots/<role>/` |

### Final verification (17 Nov 2026)

| Check | Result |
|---|---|
| Every page, every role, no console errors | 9/9 Playwright tests passed (8 roles + public page) |
| One feed value end to end | Seen in the UI 1.8 s after `POST /ingest`, with no reload; same value in the API |
| Backend stopped → restarted | UI showed *Disconnected · retrying*, then *Live* again 15 s later, with no reload |
| Map performance | 113 objects, 56 fps (AMD Radeon integrated GPU, D3D11, 1440×900) |
| Backend tests | 332/332 passed, 92.7% line coverage |

### Non-functional requirements

| NFR | How it is addressed | Evidence |
|---|---|---|
| Security | bcrypt passwords, JWT, server-side RBAC on every write, scoped shelter/team users, ingest token | TC-API-01..08, TC-API-21 |
| Usability | One map, status shown with text and icon (not colour alone), per-role navigation, public page in 3 languages | User manual; screenshots |
| Maintainability | Layers in folders, typed code, ruff/ESLint, config outside code | Exp 4, Exp 6 |
| Reliability | DB constraints, legal status transitions, write lock, reconnect with backoff | TC-SVC-02, TC-SVC-07, verification log |
| Performance | Plan generation for the seeded scenario in about 1.2 s (measured once in a smoke run); map at 56 fps | Verification log |
| Scalability | Stateless REST API over PostgreSQL; engine property tests run on randomly generated (seeded) scenarios; drills can load a larger synthetic scenario | TC-ENG-15..19 |
| Testability | Pure engine, fakes for services, real-DB API tests | Exp 8 |
| Availability | UI keeps the last data on screen and reconnects by itself; field actions queue offline | Verification log |

### Limitations

* **No real feed yet.** There is no public live feed for Chennai shelters or roads. The ingest API is
  ready, and the development replay uses a recorded sample that is clearly labelled `REPLAY`.
* **Online services.** The basemap (Esri) and road geometry (OSRM) are external. Without internet the
  map draws its data layers without basemap tiles. OSRM is used only when seeding with `--osrm`, and
  its answers are recorded.
* **Docker not tested.** `docker-compose.yml` and both Dockerfiles were written but could not be run on
  the development machine, which has no Docker.
* **CI not yet run on GitHub.** The pipeline was run step by step locally; the first GitHub run needs a
  push.
* **Single backend process.** The WebSocket hub lives in memory, so running several backend processes
  would need a shared message broker.
* **Frontend coverage not measured.** The Vitest coverage plugin is not installed.
* **Map frame rate measured on one machine.** On machines without a GPU (software rendering), the map
  runs at about 7 fps.
* **Unused submodule.** `integrations/gods-eye-view` (an earlier 3D viewer) is no longer used by the app.
  Removing it from the repository is left to the team.

### Retrospective

**What went well**
* Keeping the engine pure made it the easiest part to test (98.8% coverage) and to explain in the UI.
* Testing the API on a real PostgreSQL database caught a deadlock that fakes would have hidden.
* Generating the ER diagram and the test-case table from the code kept the documents honest.

**What was hard**
* Moving from an in-browser mock to live data touched almost every page.
* Concurrency between the drill clock, the feed and users.

**What we would do next**
* Connect a real feed source; run CI on GitHub and turn on branch protection; measure frontend coverage.

**Member contributions**

| Member | Roll no. | Contribution |
|---|---|---|
| Bhoomika | J240211026 | TODO (team) |
| Akshita Upadhyay | J240211005 | TODO (team) |
| Neel Tripathi | J240211049 | TODO (team) |
| Tanishq Saxena | J240211060 | TODO (team) |

## Conclusion

SafeRoute meets its SRS: every functional requirement is implemented, traced and tested, the system
runs on live data with one map, and the documentation explains how to install, use and maintain it. The
limitations above are what remains before real use.
