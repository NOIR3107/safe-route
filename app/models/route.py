from sqlalchemy import Column, Integer, String, Float, CheckConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Route(Base):
    __tablename__ = "routes"

    route_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source = Column(String(120), nullable=False)
    destination = Column(String(120), nullable=False)
    distance_km = Column(Float, nullable=False)
    travel_time = Column(Float, nullable=False)  # in minutes
    risk_level = Column(String(30), nullable=False, default="Low")  # Low, Moderate, High, Severe
    status = Column(String(30), nullable=False, default="Open")  # Open, Congested, Blocked, Flooded

    __table_args__ = (
        CheckConstraint("distance_km > 0", name="chk_route_distance_positive"),
        CheckConstraint("travel_time >= 0", name="chk_route_travel_time_non_negative"),
    )

    assignments = relationship("EvacuationAssignment", back_populates="route")
