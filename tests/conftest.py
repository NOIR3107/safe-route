import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.core.security import get_password_hash, create_access_token
from app.models.user import User, UserRole

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_user(db_session):
    user = User(
        name="Admin Test",
        email="admintest@saferoute.org",
        hashed_password=get_password_hash("AdminPass123"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def admin_headers(admin_user):
    token = create_access_token(subject=admin_user.user_id, role=admin_user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def coordinator_user(db_session):
    user = User(
        name="Coordinator Test",
        email="coordtest@saferoute.org",
        hashed_password=get_password_hash("CoordPass123"),
        role=UserRole.EVACUATION_COORDINATOR,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def coordinator_headers(coordinator_user):
    token = create_access_token(subject=coordinator_user.user_id, role=coordinator_user.role)
    return {"Authorization": f"Bearer {token}"}
