from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.auth import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password, create_access_token


class AuthService:
    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email.lower()).first()

    @staticmethod
    def get_by_id(db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.user_id == user_id).first()

    @staticmethod
    def register_user(db: Session, user_in: UserCreate) -> User:
        hashed_password = get_password_hash(user_in.password)
        user = User(
            name=user_in.name,
            email=user_in.email.lower(),
            hashed_password=hashed_password,
            role=user_in.role,
            phone_number=user_in.phone_number,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
        user = AuthService.get_by_email(db, email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    def create_user_token(user: User) -> dict:
        access_token = create_access_token(
            subject=user.user_id,
            role=user.role
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "user_id": user.user_id,
            "name": user.name
        }
