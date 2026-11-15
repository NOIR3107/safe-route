# Experiment 7 – Continued implementation and integration of components

## Frontend ↔ backend

The frontend never calls `fetch` from a screen. Every screen goes through one interface,
`SafeRouteApi` (`frontend/src/api/SafeRouteApi.ts`). Switching between the real backend and the
in-browser one is one line in `frontend/.env`:

```bash
VITE_API_MODE=live                              # or mock
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

In live mode `HttpApi` calls the FastAPI endpoints and checks every response against `schemas.ts`
(zod). If the backend ever changes a field, the screen shows a clear "did not match the API contract"
error instead of silently breaking.

| Screen action | Endpoint(s) |
|---|---|
| Login, role switch | `POST /auth/login/json`, `GET /auth/me` |
| Dashboard KPIs | `GET /dashboard/summary` |
| Generate plan | `POST /evacuations/generate` |
| Mark route Blocked | `PUT /routes/{id}` then `POST /evacuations/reallocate {blocked_route_id}` |
| Mark shelter Full/Closed | `PUT /shelters/{id}` then `POST /evacuations/reallocate {full_shelter_id}` |
| Audit log, bell icon | `GET /logs/audit`, `GET /logs/notifications` |

CORS for `http://localhost:5173` is already allowed in `app/config.py`.

Features the backend doesn't have yet (plan versions, explanations, drills, check-in, public lookup)
are specified as new endpoints in [`docs/api-extensions.md`](../api-extensions.md). In live mode those
screens say "not available in live mode yet" instead of failing.

## god's-eye-view (3D globe)

* Added as a git submodule: `integrations/gods-eye-view` (MIT licence, we don't edit it).
* `npm run gev` (in `frontend/`) starts it on port 4173 with `GEV_EMBED_FRAME_ANCESTORS` set so only the
  SafeRoute page may embed it. `npm run dev:all` starts both apps.
* The *God's Eye View (3D)* page loads it with `?embed=1` and talks to it with `postMessage`:
  * waits for `gev:ready`;
  * sends `gev:view` with the camera, live layers (rain radar, wind, cyclones, dams…) and annotations:
    shelters as pins coloured by status, zones as rings coloured by severity, closed roads as red arrows;
  * shows the `gev:view-applied` result.
* The conversion from SafeRoute data to god's-eye-view annotations is in
  `frontend/src/features/godseye/gev.ts` and has its own unit tests.

## Integration problems we hit (and fixes)

| Problem | Fix |
|---|---|
| Backend counts people as evacuated as soon as a plan is generated | Frontend shows *present* and *inbound* separately; written up in `api-extensions.md` so the backend can follow |
| Map rendered blank tiles when its container was resized by the layout | `ResizeObserver` → `map.invalidateSize()` and re-fit until the user moves the map |
| god's-eye-view `route` annotations are re-routed as walking routes and labelled "N min walk" | Send closed roads as arrows instead |
| god's-eye-view refuses to be framed by default (`X-Frame-Options: DENY`) | Start it with `GEV_EMBED_FRAME_ANCESTORS=http://localhost:5173` from our script |
| Vitest fails on Windows when the working directory starts with lower-case `c:` | Run tests from `C:\…`; noted in the README |
