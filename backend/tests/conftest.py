"""Shared test setup.

Engine tests need nothing. Service and API tests use a real PostgreSQL test database (two of them:
live and drill), migrated with Alembic so the migration itself is tested too. Override with
TEST_DATABASE_URL / TEST_DRILL_DATABASE_URL (CI points these at its postgres service container).
"""

from __future__ import annotations

import os
from argparse import Namespace
from pathlib import Path

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/saferoute_test")
TEST_DRILL_DB = os.environ.get("TEST_DRILL_DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/saferoute_test_drill")
# Must be set before the app is imported: the engines are created at import time.
os.environ["DATABASE_URL"] = TEST_DB
os.environ["DRILL_DATABASE_URL"] = TEST_DRILL_DB
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["PLANNING_CONFIG_FILE"] = ""
os.environ["REPLAY_FEED"] = "false"

import psycopg2  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


def _ensure_database(url: str) -> None:
    u = make_url(url)
    conn = psycopg2.connect(host=u.host, port=u.port or 5432, user=u.username, password=u.password, dbname="postgres")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (u.database,))
        if cur.fetchone() is None:
            cur.execute(f'CREATE DATABASE "{u.database}"')
    conn.close()


def _migrate(url: str) -> None:
    from alembic.config import Config

    from alembic import command

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.cmd_opts = Namespace(x=[f"url={url}"])
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def databases():
    for url in (TEST_DB, TEST_DRILL_DB):
        _ensure_database(url)
        _migrate(url)
    yield


@pytest.fixture(scope="session")
def seed_template(databases):
    """Seed the Chennai scenario once, keep a copy, and restore it before every test (fast)."""
    from app.core.database import dbs
    from app.seed import CHENNAI_FLOOD, load_scenario
    from app.services.drill import _dump

    with dbs.Live() as db:
        load_scenario(db, CHENNAI_FLOOD)
        db.commit()
    return _dump(dbs.live_engine)


@pytest.fixture
def seeded(seed_template):
    """Fresh seeded live database for one test."""
    from app.core.database import dbs
    from app.services.drill import SNAPSHOT_FILE, _restore

    dbs.mode = "live"
    _restore(dbs.live_engine, seed_template)
    yield
    dbs.mode = "live"
    SNAPSHOT_FILE.unlink(missing_ok=True)


@pytest.fixture
def repos(seeded):
    from app.core.database import dbs
    from app.repositories import Repos

    db = dbs.Live()
    yield Repos(db, "live")
    db.close()


@pytest.fixture
def client(seeded):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


PASSWORDS = {
    "Admin": ("admin@saferoute.org", "Admin@12345"),
    "Evacuation Coordinator": ("coordinator@saferoute.org", "Coord@12345"),
    "Emergency Authority": ("commander@saferoute.org", "Command@12345"),
    "Shelter Manager": ("shelter.tnagar@saferoute.org", "Shelter@12345"),
    "Transport Coordinator": ("transport@saferoute.org", "Transport@12345"),
    "Response Team": ("field.alpha@saferoute.org", "Field@12345"),
    "Relief Staff": ("relief@saferoute.org", "Relief@12345"),
    "NGO Volunteer": ("ngo@saferoute.org", "Ngo@12345"),
}


@pytest.fixture
def auth(client):
    """auth("Shelter Manager") -> headers with a valid bearer token for that seeded role."""
    cache: dict[str, dict] = {}

    def headers(role: str) -> dict:
        if role not in cache:
            email, pw = PASSWORDS[role]
            r = client.post("/api/v1/auth/login", json={"email": email, "password": pw})
            assert r.status_code == 200, r.text
            cache[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return cache[role]

    return headers
