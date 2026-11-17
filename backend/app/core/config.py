"""Application settings, read from environment variables or backend/.env (see .env.example)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.engine.config import PlanningConfig, load_planning_config

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    PROJECT_NAME: str = "SafeRoute"
    API_V1_STR: str = "/api/v1"

    # Live data. The database is the source of truth for everything the UI shows.
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/saferoute"
    # Drills run on a copy of the live data in this second database, so they never touch live rows.
    DRILL_DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/saferoute_drill"

    SECRET_KEY: str = "change-this-secret-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    BCRYPT_ROUNDS: int = 12  # tests use 4 to stay fast
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]

    # The demo role buttons on the login page call /auth/demo-accounts. Turn off outside the lab.
    DEMO_ACCOUNTS: bool = True

    # Ingestion: feeds post to /api/v1/ingest with this token in the X-Ingest-Token header.
    INGEST_TOKEN: str = "dev-ingest-token"
    # A feed counts as stale when nothing arrived for this long.
    FEED_STALE_SECONDS: int = 60
    # Dev fallback only: replay a recorded feed into /ingest. Off by default; the UI shows "REPLAY".
    REPLAY_FEED: bool = False
    REPLAY_FILE: str = str(BACKEND_DIR / "app" / "ingestion" / "samples" / "adyar_feed.jsonl")
    REPLAY_SPEED: float = 1.0
    # Road geometry and travel times (the routing service god's-eye-view uses).
    OSRM_URL: str = "https://router.project-osrm.org"

    # How often the server clock ticks (drill clock and WebSocket heartbeat), in seconds.
    CLOCK_TICK_SECONDS: float = 1.0

    PLANNING_CONFIG_FILE: str = str(BACKEND_DIR / "planning.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_planning_config() -> PlanningConfig:
    return load_planning_config(get_settings().PLANNING_CONFIG_FILE)


settings = get_settings()
