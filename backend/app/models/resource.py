"""RESOURCE (Experiment 5): relief supplies a disaster "uses"."""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import in_list
from .vocab import RESOURCE_AVAILABILITY


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="chk_resource_quantity_non_negative"),
        CheckConstraint(in_list("availability", RESOURCE_AVAILABILITY), name="chk_resource_availability"),
    )

    resource_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    disaster_id: Mapped[int | None] = mapped_column(ForeignKey("disasters.disaster_id", ondelete="SET NULL"), index=True)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    availability: Mapped[str] = mapped_column(String(20), nullable=False, default="Available")
    location: Mapped[str | None] = mapped_column(String(150))
    # How much of this supply one evacuee needs per day; used to earmark supplies per shelter (FR-09).
    per_person: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
