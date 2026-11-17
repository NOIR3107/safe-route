"""Login (JWT) and the current session."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.models import User
from app.repositories import Repos
from app.schemas.requests import LoginRequest
from app.schemas.responses import DemoAccount, SessionUser, Token, UserOut
from app.seed import DEMO_PASSWORDS
from app.services.logbook import audit

from .deps import actor_of, current_user, get_live_session, require

router = APIRouter(prefix="/auth", tags=["Auth (FR-11)"])


def _login(db: Session, email: str, password: str) -> Token:
    repos = Repos(db, "live")
    user = repos.users.by_email(email)
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Inactive user")
    audit(repos, actor_of(user), "LOGIN", "User", user.user_id, f"{user.role} signed in")
    repos.commit()
    return Token(
        access_token=create_access_token(user.user_id, user.role), token_type="bearer", role=user.role, user_id=user.user_id, name=user.name
    )


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_live_session)) -> Token:
    return _login(db, body.email, body.password)


@router.post("/token", response_model=Token, include_in_schema=False)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_live_session)) -> Token:
    """Same as /login but with a form body, for the "Authorize" button on /docs."""
    return _login(db, form.username, form.password)


@router.get("/me", response_model=SessionUser)
def me(user: User = Depends(current_user)) -> dict:
    return {
        "user_id": user.user_id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "scope": {"user_id": user.user_id, "shelter_id": user.shelter_id, "team_id": user.team_id, "zone_ids": None},
    }


@router.get("/demo-accounts", response_model=list[DemoAccount])
def demo_accounts(db: Session = Depends(get_live_session)) -> list[dict]:
    """Seeded lab accounts for the login page's role buttons. Disabled with DEMO_ACCOUNTS=false."""
    if not settings.DEMO_ACCOUNTS:
        return []
    users = Repos(db, "live").users.list()
    return [
        {"email": u.email, "password": DEMO_PASSWORDS[u.email], "role": u.role, "name": u.name} for u in users if u.email in DEMO_PASSWORDS
    ]


users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("", response_model=list[UserOut])
def list_users(_=Depends(require("users:manage")), db: Session = Depends(get_live_session)) -> list[dict]:
    return [
        {
            "user_id": u.user_id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "phone_number": u.phone_number,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in Repos(db, "live").users.list()
    ]
