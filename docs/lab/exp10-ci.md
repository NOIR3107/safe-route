# Experiment 10 – Continuous Integration with GitHub Actions

Two workflows in `.github/workflows/`, each triggered only when its part of the repo changes.

## Backend CI (`backend-ci.yml`)

Runs on pushes/PRs that touch `app/`, `tests/`, requirements or `pytest.ini`.

1. Check out, set up Python 3.12 (pip cache).
2. `pip install -r requirements-dev.txt`
3. `pytest --cov=app --cov-report=xml --junitxml=reports/pytest-junit.xml`
4. Upload the JUnit report and `coverage.xml` as the **backend-test-report** artifact (also on failure).

## Frontend CI (`frontend-ci.yml`)

Runs on pushes/PRs that touch `frontend/`.

| Job | Steps |
|---|---|
| `check` | `npm ci` → `npm run typecheck` (TypeScript strict) → `npm run lint` (ESLint, 0 warnings allowed) → `npm test` (Vitest) → `npm run build` (production build + PWA) |
| `e2e` | after `check`: install Chromium → `npx playwright test e2e/demo-flow.spec.ts`; uploads traces if it fails |

The god's-eye-view e2e test is not run in CI (it needs the 3D app running) and skips itself.

## What a failing build looks like

Any failed step marks the PR check red, and with branch protection on, the PR can't be merged until
it's fixed. The uploaded artifacts (JUnit XML, coverage, Playwright traces) show which test failed and
why.

## Running the same checks locally

```bash
pytest --cov=app                       # backend
cd frontend
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e                            # browser tests (first time: npx playwright install chromium)
```

> **TODO (team):** add a screenshot of a green run from the GitHub *Actions* tab after the first push.
