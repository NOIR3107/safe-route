from sqlalchemy import Column, Integer, String, CheckConstraint
from app.core.database import Base


class Resource(Base):
    __tablename__ = "resources"

    resource_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resource_type = Column(String(80), nullable=False)  # Water, Food Packs, Medical Kits, Blankets, Fuel
    quantity = Column(Integer, nullable=False, default=0)
    availability = Column(String(30), nullable=False, default="Available")  # Available, Low Stock, Depleted
    location = Column(String(150), nullable=True)

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="chk_resource_quantity_non_negative"),
    )
