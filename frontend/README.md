# SafeRoute frontend

React + TypeScript (Vite) web app for SafeRoute. It reads everything from the FastAPI backend in
`../backend`; there is no built-in demo data.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (copies the CesiumJS assets to public/cesium first)
```

The backend must be running on `http://localhost:8000` (see the root README). To use another address,
copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## Where things are

| Folder | What it holds |
|---|---|
| `src/api/` | `HttpApi.ts` (the only API client), zod schemas for every response, `live.ts` (WebSocket: connection state, refetch on `changed`) |
| `src/hooks/queries.ts` | The data store: TanStack Query hooks. Nothing polls; the WebSocket says when to refetch |
| `src/components/map/` | The one map: `GlobeView` (CesiumJS renderer), `OpsGlobe` (store-fed), `LayerControl`, `MapDetail`, `EmbeddedMap` |
| `src/features/` | One folder per page (dashboard, plan, drill, resources, checkin, field, audit, public, architecture, auth) |
| `src/lib/rbac.ts` | What each of the 8 roles may see and do (mirrors `backend/app/core/rbac.py`) |
| `src/index.css` | Design tokens: neutrals, the signal accent, status colours, the severity ramp |

### Connection states

The top bar shows the data source (`LIVE`, `DRILL` or `REPLAY`), the operation clock and the connection
state:

* **Connecting**: before the first message.
* **Live**: a heartbeat arrived in the last 5 s.
* **Stale**: no heartbeat for 5 s. The data on screen is the last one received.
* **Disconnected**: the socket closed. The app reconnects with backoff and refetches everything when back.

## Checks

```bash
npm run typecheck
npm run lint
npm test           # Vitest unit tests
npm run build
npm run e2e        # Playwright: every page for all 8 roles, fails on any console error
```

Run Vitest and Playwright from a path that starts with an uppercase drive letter (`C:\...`) on
Windows. With a lowercase `c:` path, Vite loads some modules twice.

`npm run e2e` also saves a screenshot of every page for each role to `../docs/screenshots/<role>/`.
Those images are used in the user manual.
