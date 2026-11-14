from datetime import datetime
from typing import Optional, Annotated
from pydantic import BaseModel, ConfigDict, StringConstraints

EmailStr = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")]


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: str = "Evacuation Coordinator"
    phone_number: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserResponse(UserBase):
    user_id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
