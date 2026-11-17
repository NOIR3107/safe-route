"""ROUTE (Experiment 5) and the named road segments each route uses.

A route links one affected zone to one shelter (class diagram: Route "has" AffectedZone, the
simple class diagram's Assignment "via" Route). The segments are kept in their own table so an
event like "Thiru Vi Ka Bridge flooded" can find every route that crosses that bridge.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import JSONType, in_list
from .vocab import GEOMETRY_SOURCES, ROUTE_RISK_LEVELS, ROUTE_STATUSES


class RoadSegment(Base):
    __tablename__ = "road_segments"

    segment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (
        CheckConstraint("distance_km > 0", name="chk_route_distance_positive"),
        CheckConstraint("travel_time >= 0", name="chk_route_travel_time_non_negative"),
        CheckConstraint(in_list("risk_level", ROUTE_RISK_LEVELS), name="chk_route_risk_level"),
        CheckConstraint(in_list("status", ROUTE_STATUSES), name="chk_route_status"),
        CheckConstraint(in_list("geometry_source", GEOMETRY_SOURCES), name="chk_route_geometry_source"),
    )

    route_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    disaster_id: Mapped[int | None] = mapped_column(ForeignKey("disasters.disaster_id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("affected_zones.zone_id", ondelete="CASCADE"), nullable=False, index=True)
    shelter_id: Mapped[int] = mapped_column(ForeignKey("shelters.shelter_id", ondelete="CASCADE"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    destination: Mapped[str] = mapped_column(String(120), nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    travel_time: Mapped[float] = mapped_column(Float, nullable=False)  # minutes
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="Low")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Open")
    # Road geometry as a list of [lat, lon] points (one LINESTRING value). "osrm" when it came from
    # the routing service, "schematic" when it is the straight zone -> segments -> shelter sketch.
    path: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    geometry_source: Mapped[str] = mapped_column(String(20), nullable=False, default="schematic")

    segments: Mapped[list[RouteSegment]] = relationship(order_by="RouteSegment.position", cascade="all, delete-orphan", lazy="selectin")

    @property
    def via(self) -> list[str]:
        return [s.segment.name for s in self.segments]

    @property
    def label(self) -> str:
        names = self.via
        return f"R{self.route_id} via {' · '.join(names)}" if names else f"R{self.route_id} direct"


class RouteSegment(Base):
    __tablename__ = "route_segments"

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.route_id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    segment_id: Mapped[int] = mapped_column(ForeignKey("road_segments.segment_id", ondelete="CASCADE"), nullable=False, index=True)

    segment: Mapped[RoadSegment] = relationship(lazy="joined")
