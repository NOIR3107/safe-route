# Contributing to SafeRoute

How the team works on this repository (lab Experiment 9).

## Branches

* `main`: released, always green. Protected; changes arrive only by pull request from `develop`.
* `develop`: integration branch. Protected; feature branches merge here.
* `feature/<short-name>`: new functionality, e.g. `feature/shelter-checkin`.
* `fix/<short-name>`: bug fixes, e.g. `fix/near-full-status`.
* `docs/<short-name>`, `test/<short-name>`, `ci/<short-name>`: docs, tests or pipeline only.

Branch from an up-to-date `develop`, keep branches small, delete them after merging.

```bash
git checkout develop && git pull
git checkout -b feature/my-change
# ...work, commit...
git push -u origin feature/my-change      # then open a PR into develop
```

## Commit messages (Conventional Commits)

```
<type>(<scope>): <what changed, imperative>

feat(engine): exclude shelters whose route is flooded
fix(frontend): show Near Full at 90% load instead of Full
test(api): cover RBAC on route endpoints
docs(exp11): add test summary report
ci: run ruff before pytest
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `style`, `ci`, `chore`. Scopes in use: `backend`,
`engine`, `api`, `frontend`, `map`, `db`, `expNN`.

## Pull requests

1. Open the PR into `develop` and fill in the template.
2. CI must be green (backend: ruff, pytest with ≥80% coverage on PostgreSQL; frontend: typecheck,
   ESLint, Vitest, build).
3. At least **one other member** approves. Code owners (see `.github/CODEOWNERS`) are requested
   automatically. Nobody merges their own PR without an approval.
4. Squash and merge.

### Reviewer checklist

- [ ] It does what the PR says, and nothing surprising besides.
- [ ] New logic has tests (engine, service or endpoint); test IDs follow `TC-<AREA>-<NN>`.
- [ ] New write endpoints check the role (`require("...")` in `app/api`) and the UI hides what the role
      can't do (`can(...)` in `src/lib/rbac.ts`).
- [ ] Schema changes come with an Alembic migration, and `docs/db/schema.sql` is regenerated.
- [ ] No secrets, `.env` files, database dumps or build output.
- [ ] UI: status has a label or icon, not colour alone; numbers use tabular figures; works at phone width.
- [ ] Docs updated if behaviour changed.

Mark optional comments with `nit:`.

## Branch protection (GitHub → Settings → Branches → Add rule)

For `main` and for `develop`:

1. Require a pull request before merging; required approvals: **1**.
2. Require review from Code Owners.
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass: **Backend (ruff + pytest on PostgreSQL)** and
   **Frontend (typecheck + eslint + vitest + build)**.
5. Require branches to be up to date before merging.
6. Do not allow bypassing the above settings; block force pushes and deletions.

## Running locally

See the root [README](README.md). Before pushing:

```bash
cd backend && ruff check . && ruff format --check . && pytest
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```
