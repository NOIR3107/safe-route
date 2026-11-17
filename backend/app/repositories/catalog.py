"""Repositories for the master data: users, disasters, zones, households, shelters, routes, fleet."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AffectedZone,
    Disaster,
    Household,
    RescueTeam,
    Resource,
    RoadSegment,
    Route,
    RouteSegment,
    Shelter,
    User,
    Vehicle,
)


class _Repo:
    model: type = None  # type: ignore[assignment]

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, pk):
        return self.db.get(self.model, pk)

    def list(self) -> list:
        pk = self.model.__mapper__.primary_key[0]
        return list(self.db.scalars(select(self.model).order_by(pk)))

    def add(self, obj):
        self.db.add(obj)
        self.db.flush()
        return obj


class UserRepository(_Repo):
    model = User

    def by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))


class DisasterRepository(_Repo):
    model = Disaster

    def active(self) -> Disaster | None:
        """The incident being worked on: the newest active one."""
        return self.db.scalar(
            select(Disaster).where(Disaster.status == "Active").order_by(Disaster.start_date.desc(), Disaster.disaster_id.desc())
        )


class ZoneRepository(_Repo):
    model = AffectedZone

    def by_code(self, code: str) -> AffectedZone | None:
        return self.db.scalar(select(AffectedZone).where(func.upper(AffectedZone.code) == code.strip().upper()))


class HouseholdRepository(_Repo):
    model = Household

    def list(self) -> list[Household]:
        return list(self.db.scalars(select(Household).order_by(Household.household_id)))

    def by_ids(self, ids: list[str]) -> dict[str, Household]:
        if not ids:
            return {}
        return {h.household_id: h for h in self.db.scalars(select(Household).where(Household.household_id.in_(ids)))}

    def awaiting_with_zone(self) -> list[Household]:
        return list(
            self.db.scalars(
                select(Household).where(Household.status == "Awaiting", Household.zone_id.is_not(None)).order_by(Household.household_id)
            )
        )

    def by_token(self, token: str) -> Household | None:
        t = token.strip().upper()
        return self.db.scalar(select(Household).where(or_(func.upper(Household.token) == t, func.upper(Household.household_id) == t)))

    def next_walk_in_number(self, shelter_id: int) -> int:
        prefix = f"WI-{shelter_id}-"
        count = self.db.scalar(select(func.count()).select_from(Household).where(Household.household_id.like(prefix + "%")))
        return (count or 0) + 1


class ShelterRepository(_Repo):
    model = Shelter

    def get_candidates(self) -> list[Shelter]:
        """Every shelter; the engine decides which are feasible (sequence diagram step 4)."""
        return self.list()


class RouteRepository(_Repo):
    model = Route

    def get_routes(self) -> list[Route]:
        """Sequence diagram step 5."""
        return self.list()

    def via_segment(self, segment_name: str) -> list[Route]:
        q = (
            select(Route)
            .join(RouteSegment, RouteSegment.route_id == Route.route_id)
            .join(RoadSegment, RoadSegment.segment_id == RouteSegment.segment_id)
            .where(func.lower(RoadSegment.name) == segment_name.strip().lower())
            .order_by(Route.route_id)
        )
        return list(self.db.scalars(q))

    def segment_by_name(self, name: str) -> RoadSegment | None:
        return self.db.scalar(select(RoadSegment).where(RoadSegment.name == name))

    def segments(self) -> list[RoadSegment]:
        return list(self.db.scalars(select(RoadSegment).order_by(RoadSegment.name)))


class VehicleRepository(_Repo):
    model = Vehicle

    def available(self) -> list[Vehicle]:
        return list(self.db.scalars(select(Vehicle).where(Vehicle.status == "Available").order_by(Vehicle.vehicle_id)))


class TeamRepository(_Repo):
    model = RescueTeam


class ResourceRepository(_Repo):
    model = Resource

    def get_resources(self) -> list[Resource]:
        """Sequence diagram step 6."""
        return self.list()
