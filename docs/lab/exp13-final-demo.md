# Experiment 13 – Final demonstration

## Before the demo (10 minutes earlier)

```bash
# terminal 1 – backend (only if showing live mode / Swagger)
.venv\Scripts\activate
python run.py                      # http://localhost:8000/docs

# terminal 2 – frontend + 3D globe
cd frontend
npm run dev:all                    # SafeRoute :5173, god's-eye-view :4173
```

* Open http://localhost:5173, press **Reset** on the Drill page so the data is fresh.
* Open the *God's Eye View (3D)* page once so the globe tiles are cached.
* Keep the test output ready: `pytest` and `npm test` in a second terminal.

## Demo script (~10 minutes)

| # | Who | Show | Point to make |
|---|---|---|---|
| 1 | | Login page → **Coordinator** | Six roles, one-click demo accounts |
| 2 | | Dashboard → **Generate plan** | Map: zones by severity, shelters by occupancy, routes by status; KPIs |
| 3 | | Allocation Plan → click a row | "Why this shelter?": cost breakdown + rejected alternatives (FR-07/08) |
| 4 | | **Compare strategies** | Greedy vs Min-Cost Flow trade-off |
| 5 | | **Approve** | System proposes, human approves |
| 6 | | Drill → 16× → Start | Bridge floods at T+20, walk-ins at T+32, power loss at T+45 |
| 7 | | Inject **Block** route | Only affected groups move (FR-10) |
| 8 | | Plan Versions | v1 → v2 → … diff: who moved, why, ΔETA |
| 9 | | Override with reason | New version, reason required |
| 10 | | God's Eye View (3D) | Same shelters/zones on a 3D globe with live rain radar and dams |
| 11 | | Switch role → Incident Commander → Audit | Override + re-allocations in the append-only log (FR-12) |
| 12 | | Switch role → Shelter Manager | Scoped to one shelter, check-in, reunification search (FR-11) |
| 13 | | Field Team on a phone width, *Simulate offline* | Offline queue, sync on reconnect |
| 14 | | `/public` in Tamil / Hindi | `VEL` or `98400 12345` |
| 15 | | Terminal: `pytest`, `npm test`; GitHub Actions tab | 83 tests, CI |

> **TODO (team):** fill the "Who" column so everyone presents a part.

## Questions we expect

* *Why two allocation strategies?* Greedy is simple and fast and serves the most urgent zone first.
  Min-Cost Flow finds the lowest total severity-weighted cost for everyone. Showing both makes the
  trade-off visible.
* *What if the system is wrong?* Every assignment is explained, nothing is final until a coordinator
  approves, and overrides need a reason that goes into the audit log.
* *What happens without internet?* The field view is a PWA; actions are queued and synced later.
* *Is god's-eye-view your code?* No. It's an MIT-licensed open-source project included as a submodule;
  our part is the integration (embedding, the message protocol and the overlay of our data).

## CIE checklist

- [ ] Project charter and feasibility (Exp 1)
- [ ] SRS with FRs/NFRs (Exp 2)
- [ ] UML: use case, class, activity, sequence (Exp 3)
- [ ] Architecture diagram (Exp 4)
- [ ] ER diagram + schema (Exp 5)
- [ ] Working implementation (Exp 6–7)
- [ ] Unit + integration tests (Exp 8)
- [ ] Git branching + PR (Exp 9)
- [ ] CI green (Exp 10)
- [ ] Test plan / cases / report (Exp 11)
- [ ] Final report + retrospective (Exp 12)
- [ ] Live demo (Exp 13)
