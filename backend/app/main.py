"""SafeRoute API.

React UI -> FastAPI routers (REST + WebSocket) -> services -> allocation engine (pure Python)
-> repositories (SQLAlchemy) -> PostgreSQL. Run with:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, catalog, ingest, operations, ops, planning, ws
from app.core.config import settings
from app.core.events import hub

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    hub.bind(asyncio.get_running_loop())
    tasks = [asyncio.create_task(ws.clock_loop())]
    if settings.REPLAY_FEED:
        from app.ingestion.replay import run_replay

        tasks.append(asyncio.create_task(run_replay(settings.REPLAY_FILE, settings.REPLAY_SPEED)))
    yield
    for t in tasks:
        t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await t


app = FastAPI(
    title="SafeRoute API",
    description=(
        "Disaster evacuation and shelter allocation decision support (JSS University SE lab). "
        "Sign in with POST /api/v1/auth/login or the Authorize button (seeded accounts are in the README)."
    ),
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

api = settings.API_V1_STR
for module in (auth, catalog, planning, operations, ops, ingest):
    app.include_router(module.router, prefix=api)
app.include_router(auth.users_router, prefix=api)
app.include_router(ws.router, prefix=api)


@app.get("/health", tags=["Health"])
def health() -> dict:
    return {"status": "ok"}
