# Experiment 9 – Version Control and Collaborative Workflow (Git & GitHub)

## Objective

To manage the source code with Git and GitHub using a branching model, conventional commits, pull
requests with reviews, and protected branches.

## Procedure

1. Chose a branching model: `main` (released) ← `develop` (integration) ← `feature/*`, `fix/*`,
   `docs/*`, `test/*`, `ci/*`.
2. Adopted Conventional Commits (`feat(engine): ...`, `fix(frontend): ...`, `docs(exp11): ...`).
3. Added the collaboration files to the repository:
   * [`CONTRIBUTING.md`](../../CONTRIBUTING.md): branches, commit format, PR rules, reviewer
     checklist, branch-protection steps;
   * [`.github/pull_request_template.md`](../../.github/pull_request_template.md);
   * [`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE): bug report and feature/requirement;
   * [`.github/CODEOWNERS`](../../.github/CODEOWNERS): who reviews which folder.
4. Branch protection is set in GitHub settings, as listed in CONTRIBUTING (require PR, 1 approval,
   code-owner review, green CI checks, no force push).

## Output

### Branch model

```
main      ●───────────────────────────●──────────   (release; PR from develop only)
           \                         /
develop     ●────●─────────●────────●──────────────  (integration; protected)
                  \       / \      /
feature/...        ●──●──●   ●──●─●                   (one change each, squash-merged)
```

### History so far (from `git log`)

| Author | Commits |
|---|---:|
| Tanishq Saxena | 8 |
| akshitaupadhyay | 5 |

These are the commits in the local repository when this was written, before the
`feature/live-map-console` work was pushed. TODO (team): Bhoomika and Neel Tripathi's contributions are
recorded in the retrospective ([Experiment 12](../exp12/exp-12.md#retrospective)).

### Pull requests to open

The work on `feature/live-map-console` is split into reviewable PRs into `develop`. Each needs an
approval from a member who did not write it:

| PR | Content | Suggested reviewer |
|---|---|---|
| `feat(backend)`: layered FastAPI + PostgreSQL backend | `backend/` | TODO (team) |
| `feat(frontend)`: live store, one CesiumJS map, ops console | `frontend/` | TODO (team) |
| `ci`: one pipeline with PostgreSQL service | `.github/workflows/ci.yml` | TODO (team) |
| `docs`: experiments 1–12, UML, schema | `docs/` | TODO (team) |

> Status: the PRs, the `develop` branch on GitHub and branch protection need a push to GitHub. That is
> done by the team. No reviews or approvals are claimed in this document. TODO (team): add PR links and
> reviewers once they exist.

### Conventional commit examples from this repository

```
feat(backend): layered FastAPI + PostgreSQL backend matching the lab design
feat(frontend): live data store, single CesiumJS map, ops-console dashboard
feat(frontend): embedded live map on resource pages, role-by-role e2e sweep
```

## Conclusion

The repository has a documented branching model, commit format, templates and review rules. The
remaining steps (pushing `develop`, turning on protection, opening the PRs and reviewing them) need each
member's GitHub account and are listed as team TODOs, not reported as done.
