from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Disaster(Base):
    __tablename__ = "disasters"

    disaster_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(50), nullable=False)  # Flood, Earthquake, Fire, Cyclone, Chemical Leak
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(20), nullable=False, default="High")  # Low, Medium, High, Critical
    status = Column(String(30), nullable=False, default="Active")  # Active, Under Control, Resolved
    start_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    end_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    zones = relationship("AffectedZone", back_populates="disaster", cascade="all, delete-orphan")
    evacuation_plans = relationship("EvacuationPlan", back_populates="disaster")


class AffectedZone(Base):
    __tablename__ = "affected_zones"

    zone_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    disaster_id = Column(Integer, ForeignKey("disasters.disaster_id"), nullable=False)
    name = Column(String(100), nullable=False)
    state = Column(String(60), nullable=True)
    district = Column(String(60), nullable=True)
    location = Column(String(200), nullable=False)
    population = Column(Integer, nullable=False, default=0)
    priority = Column(String(20), nullable=False, default="P1")  # P1, P2, P3, P4
    risk_level = Column(String(20), nullable=False, default="High")  # Extreme, High, Moderate, Low
    evacuated_count = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default="Pending")  # Pending, In Progress, Evacuated

    __table_args__ = (
        CheckConstraint("population >= 0", name="chk_zone_population_non_negative"),
        CheckConstraint("evacuated_count >= 0", name="chk_zone_evacuated_non_negative"),
    )

    disaster = relationship("Disaster", back_populates="zones")
    assignments = relationship("EvacuationAssignment", back_populates="zone")
