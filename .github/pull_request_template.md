## What changed

<!-- One or two lines. Link the issue: Closes #12 -->

## Why

## Requirements touched

<!-- FR-xx, and the test IDs that cover it -->

## How it was tested

- [ ] `ruff check . && pytest` passes (backend)
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` passes (frontend)
- [ ] Tried it in the browser as: <!-- which roles and pages -->

## Checklist

- [ ] PR targets `develop` and the branch is up to date
- [ ] Commit messages follow Conventional Commits
- [ ] Schema change has an Alembic migration (and `docs/db/schema.sql` is regenerated)
- [ ] No secrets, `.env` files or database dumps committed
- [ ] Docs updated if behaviour changed; screenshots attached for UI changes
