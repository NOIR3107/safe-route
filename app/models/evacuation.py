from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class EvacuationPlan(Base):
    __tablename__ = "evacuation_plans"

    plan_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    disaster_id = Column(Integer, ForeignKey("disasters.disaster_id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(150), nullable=False)
    status = Column(String(40), nullable=False, default="Draft")  # Draft, Active, Completed, Reallocated, Cancelled
    priority = Column(String(20), nullable=False, default="High")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    disaster = relationship("Disaster", back_populates="evacuation_plans")
    creator = relationship("User", back_populates="evacuation_plans")
    assignments = relationship("EvacuationAssignment", back_populates="plan", cascade="all, delete-orphan")


class EvacuationAssignment(Base):
    __tablename__ = "evacuation_assignments"

    assignment_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("evacuation_plans.plan_id"), nullable=False)
    zone_id = Column(Integer, ForeignKey("affected_zones.zone_id"), nullable=False)
    shelter_id = Column(Integer, ForeignKey("shelters.shelter_id"), nullable=False)
    route_id = Column(Integer, ForeignKey("routes.route_id"), nullable=True)
    people_count = Column(Integer, nullable=False)
    status = Column(String(40), nullable=False, default="Scheduled")  # Scheduled, In Progress, Completed, Rerouted, Cancelled
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("people_count > 0", name="chk_assignment_people_count_positive"),
    )

    plan = relationship("EvacuationPlan", back_populates="assignments")
    zone = relationship("AffectedZone", back_populates="assignments")
    shelter = relationship("Shelter", back_populates="assignments")
    route = relationship("Route", back_populates="assignments")
    vehicle_assignments = relationship("VehicleAssignment", back_populates="assignment", cascade="all, delete-orphan")


class VehicleAssignment(Base):
    __tablename__ = "vehicle_assignments"

    vehicle_assignment_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("evacuation_assignments.assignment_id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.vehicle_id"), nullable=False)
    departure_time = Column(DateTime, nullable=True)
    arrival_time = Column(DateTime, nullable=True)
    status = Column(String(30), nullable=False, default="Assigned")  # Assigned, In Transit, Completed, Reassigned

    assignment = relationship("EvacuationAssignment", back_populates="vehicle_assignments")
    vehicle = relationship("Vehicle", back_populates="vehicle_assignments")
