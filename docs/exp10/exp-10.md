# Experiment 10 – Continuous Integration with GitHub Actions

## Objective

To build and test every change automatically with GitHub Actions, and to block merging when lint,
tests or coverage fail.

## Procedure

1. Replaced the two old workflows with one pipeline, [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
   The old ones pointed at folders that no longer exist (`app/**` at the repository root).
2. **Backend job** on `ubuntu-latest`:
   * a `postgres:16` service container with a health check;
   * Python 3.12 with pip caching keyed on `backend/requirements*.txt`;
   * `ruff check` and `ruff format --check`;
   * `pytest` with coverage, failing under 80% (`--cov-fail-under=80`), writing JUnit and Cobertura
     XML;
   * reports uploaded as the `backend-test-reports` artifact, even when a step fails.
3. **Frontend job**: Node 22 with npm caching, `npm ci`, typecheck, ESLint (zero warnings), Vitest
   with a JUnit report, production build; the report is uploaded as `frontend-test-reports`.
4. Triggers: every pull request, and pushes to `main` and `develop`. A newer run on the same branch
   cancels the older one.
5. Added the status badge to the [README](../../README.md).
6. Ran every CI command locally before committing.

## Output

### Pipeline

```
push / pull_request
   ├── Backend  ── postgres:16 service ── pip install ── ruff check ── ruff format --check ── pytest --cov (≥80%) ── upload junit + coverage
   └── Frontend ── npm ci ── tsc ── eslint ── vitest (junit) ── vite build ── upload junit
```

### The same commands run locally (17 Nov 2026)

| Step | Result |
|---|---|
| `ruff check .` | All checks passed |
| `ruff format --check .` | 83 files already formatted |
| `pytest --cov=app` | 332 passed, 92.7% coverage |
| `npm run typecheck` | no errors |
| `npm run lint` | no warnings |
| `vitest run --reporter=junit` | 10 passed, JUnit written |
| `npm run build` | exit 0 (`tsc -b && vite build`; Vite bundling finished in 1.35 s) |

### Status on GitHub

> Not yet run on GitHub: the branch has not been pushed. TODO (team): after pushing, open the Actions
> tab, confirm both jobs are green, paste the run link here, and replace `OWNER/REPO` in the README
> badge. Nothing in this document claims a green GitHub run.

### Branch protection

The two job names are the required status checks in the protection rule (see
[CONTRIBUTING.md](../../CONTRIBUTING.md#branch-protection-github--settings--branches--add-rule)):
`Backend (ruff + pytest on PostgreSQL)` and `Frontend (typecheck + eslint + vitest + build)`.

## Conclusion

The pipeline checks style, types, unit and API tests on a real PostgreSQL database, coverage and the
production build for every change. With branch protection on, a change cannot merge while any of these
fails.
