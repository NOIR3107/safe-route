from sqlalchemy import Column, Integer, String, CheckConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    vehicle_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    vehicle_type = Column(String(50), nullable=False)  # Bus, Ambulance, Truck, Boat, Van
    capacity = Column(Integer, nullable=False)
    status = Column(String(30), nullable=False, default="Available")  # Available, Assigned, In Transit, Maintenance
    current_location = Column(String(120), nullable=False)
    plate_number = Column(String(30), nullable=True)

    __table_args__ = (
        CheckConstraint("capacity > 0", name="chk_vehicle_capacity_positive"),
    )

    vehicle_assignments = relationship("VehicleAssignment", back_populates="vehicle")


class RescueTeam(Base):
    __tablename__ = "rescue_teams"

    team_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    members_count = Column(Integer, nullable=False, default=5)
    contact_number = Column(String(30), nullable=False)
    status = Column(String(30), nullable=False, default="Available")  # Available, Deployed, Standby
    current_location = Column(String(120), nullable=True)

    __table_args__ = (
        CheckConstraint("members_count > 0", name="chk_team_members_positive"),
    )
