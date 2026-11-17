"""Repository layer (Experiment 4): the only code that talks to the database.

Services receive a `Repos` object and never write queries themselves. Tests can pass in fake
repositories instead (see tests/services).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from .audit import AuditRepository, NotificationRepository, OpsEventRepository
from .catalog import (
    DisasterRepository,
    HouseholdRepository,
    ResourceRepository,
    RouteRepository,
    ShelterRepository,
    TeamRepository,
    UserRepository,
    VehicleRepository,
    ZoneRepository,
)
from .ops import IngestRepository, OpsStateRepository
from .plans import PlanRepository


class Repos:
    def __init__(self, db: Session, mode: str = "live") -> None:
        self.db = db
        self.mode = mode  # "live" or "drill": which database this session belongs to
        self.users = UserRepository(db)
        self.disasters = DisasterRepository(db)
        self.zones = ZoneRepository(db)
        self.households = HouseholdRepository(db)
        self.shelters = ShelterRepository(db)
        self.routes = RouteRepository(db)
        self.vehicles = VehicleRepository(db)
        self.teams = TeamRepository(db)
        self.resources = ResourceRepository(db)
        self.plans = PlanRepository(db)
        self.audit = AuditRepository(db)
        self.notifications = NotificationRepository(db)
        self.events = OpsEventRepository(db)
        self.ops = OpsStateRepository(db)
        self.ingest = IngestRepository(db)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()


__all__ = ["Repos"]
