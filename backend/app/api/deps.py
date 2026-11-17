"""FastAPI dependencies: database session, current user, permission checks."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import dbs, serialize_writes
from app.core.events import ALL, hub
from app.core.rbac import can, roles_for
from app.core.security import decode_access_token
from app.models import User
from app.repositories import Repos
from app.services.context import Actor

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/token", auto_error=False)


def get_repos(request: Request) -> Iterator[Repos]:
    """Repositories on whichever database is active (live, or the drill copy). Requests that change
    data take the write lock first (see serialize_writes); GET requests never wait."""
    mode = dbs.mode
    db = dbs.Drill() if mode == "drill" else dbs.Live()
    try:
        if request.method != "GET":
            serialize_writes(db)
        yield Repos(db, mode)
    finally:
        db.close()


def get_live_session() -> Iterator[Session]:
    db = dbs.Live()
    try:
        yield db
    finally:
        db.close()


def current_user(token: str | None = Depends(oauth2_scheme), live: Session = Depends(get_live_session)) -> User:
    """Users and logins always come from the live database, also during a drill."""
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    payload = decode_access_token(token) if token else None
    if not payload or not str(payload.get("sub", "")).isdigit():
        raise unauthorized
    user = live.get(User, int(payload["sub"]))
    if user is None:
        raise unauthorized
    if not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Inactive user")
    return user


def actor_of(user: User) -> Actor:
    return Actor(user.user_id, user.name, user.role, user.shelter_id, user.team_id)


def current_actor(user: User = Depends(current_user)) -> Actor:
    return actor_of(user)


def require(permission: str):
    """Dependency factory: 403 unless the user's role has `permission` (FR-11)."""

    def check(user: User = Depends(current_user)) -> Actor:
        if not can(user.role, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Operation not permitted for {user.role}. Allowed: {', '.join(roles_for(permission))}.",
            )
        return actor_of(user)

    return check


def require_ingest_token(x_ingest_token: str | None = Header(default=None)) -> str:
    if x_ingest_token != settings.INGEST_TOKEN:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or wrong X-Ingest-Token")
    return x_ingest_token


def commit_and_publish(repos: Repos, topics: list[str] | None = None) -> None:
    """End of every write: commit, then tell browsers what to refetch."""
    repos.commit()
    hub.publish(topics or ALL, repos.mode)
