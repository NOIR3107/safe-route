# Contributing to SafeRoute

This is how we work on the repo as a team (lab Experiment 9).

## Branches

* `main` – always working. Nobody pushes to it directly; everything goes through a pull request.
* `feature/<short-name>` – new functionality, e.g. `feature/shelter-checkin`.
* `fix/<short-name>` – bug fixes, e.g. `fix/route-status-replan`.
* `docs/<short-name>` – documentation only.
* `test/<short-name>` – tests only.

Branch from an up-to-date `main`, keep branches small, and delete them after merging.

```bash
git checkout main && git pull
git checkout -b feature/my-change
# ...work...
git push -u origin feature/my-change   # then open a PR on GitHub
```

## Commits

Short imperative messages with a type prefix, the same style as our history:

```
feat: add walk-in registration to shelter check-in
fix: stop re-planning when a blocked route has no assignments
test: cover RBAC on route endpoints
docs: add test plan
```

## Pull requests

1. Open the PR against `main` and fill in the template (`.github/pull_request_template.md`).
2. CI has to be green: **Backend CI** (pytest) and/or **Frontend CI** (typecheck, lint, Vitest, build,
   Playwright) depending on what you touched.
3. At least **one other team member reviews** before merging. The author doesn't merge their own PR
   without a review.
4. Use **Squash and merge** so `main` stays readable.

### What the reviewer checks

* Does it do what the PR says, and nothing surprising beyond that?
* Are there tests for new logic (engine, services, endpoints)?
* Role checks on any new write endpoint (`require_roles`) and in the frontend (`can(...)`).
* No secrets, `.env`, `saferoute.db` or build output committed.
* UI: status is shown with an icon/label, not just colour; works on a phone width.
* Names and comments make sense to someone who didn't write it.

Leave comments on specific lines; mark them as "nit:" if they're optional.

## Running things locally

```bash
# backend
python -m venv .venv && .venv\Scripts\activate      # source .venv/bin/activate on Linux/macOS
pip install -r requirements-dev.txt
python run.py                                        # http://localhost:8000/docs
pytest

# frontend
cd frontend
npm install
npm run dev                                          # http://localhost:5173
npm test && npm run e2e

# god's-eye-view (3D globe), optional
git submodule update --init
cd frontend && npm run gev:install && npm run dev:all
```
