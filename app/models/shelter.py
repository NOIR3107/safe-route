from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Shelter(Base):
    __tablename__ = "shelters"

    shelter_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    location = Column(String(255), nullable=False)  # Address or coordinates description
    capacity = Column(Integer, nullable=False)
    current_occupancy = Column(Integer, nullable=False, default=0)
    facilities = Column(Text, nullable=True)  # Comma-separated or JSON e.g. "Medical,Food,Bedding,Power"
    status = Column(String(30), nullable=False, default="Active")  # Active, Full, Inactive, Closed
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    __table_args__ = (
        CheckConstraint("capacity > 0", name="chk_shelter_capacity_positive"),
        CheckConstraint("current_occupancy >= 0", name="chk_shelter_occupancy_non_negative"),
        CheckConstraint("current_occupancy <= capacity", name="chk_shelter_occupancy_lte_capacity"),
    )

    facilities_list = relationship("ShelterFacility", back_populates="shelter", cascade="all, delete-orphan")
    assignments = relationship("EvacuationAssignment", back_populates="shelter")


class ShelterFacility(Base):
    __tablename__ = "shelter_facilities"

    facility_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    shelter_id = Column(Integer, ForeignKey("shelters.shelter_id"), nullable=False)
    facility_type = Column(String(80), nullable=False)  # Medical, Kitchen, Generator, Disabled Access, Sanitation
    capacity = Column(Integer, nullable=True)
    availability_status = Column(String(30), nullable=False, default="Available")  # Available, Limited, Unavailable

    shelter = relationship("Shelter", back_populates="facilities_list")
