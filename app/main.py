from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.database import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.routers import (
    auth_router,
    users_router,
    disasters_router,
    zones_router,
    shelters_router,
    routes_router,
    vehicles_router,
    rescue_teams_router,
    resources_router,
    evacuations_router,
    dashboard_router,
    logs_router
)


def seed_default_admin():
    db = SessionLocal()
    try:
        admin_email = "admin@saferoute.org"
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            admin_user = User(
                name="System Administrator",
                email=admin_email,
                hashed_password=get_password_hash("Admin@12345"),
                role=UserRole.ADMIN,
                phone_number="+91-9876543210",
                is_active=True
            )
            db.add(admin_user)
            db.commit()

        coord_email = "coordinator@saferoute.org"
        coord = db.query(User).filter(User.email == coord_email).first()
        if not coord:
            coord_user = User(
                name="Evacuation Coordinator",
                email=coord_email,
                hashed_password=get_password_hash("Coord@12345"),
                role=UserRole.EVACUATION_COORDINATOR,
                phone_number="+91-9876543211",
                is_active=True
            )
            db.add(coord_user)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed default users
    Base.metadata.create_all(bind=engine)
    seed_default_admin()
    yield
    # Shutdown logic if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SafeRoute is a Decision-Support System for Disaster Evacuation and Constraint-Based Shelter Allocation.",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
api_v1_prefix = settings.API_V1_STR
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=api_v1_prefix)
app.include_router(disasters_router, prefix=api_v1_prefix)
app.include_router(zones_router, prefix=api_v1_prefix)
app.include_router(shelters_router, prefix=api_v1_prefix)
app.include_router(routes_router, prefix=api_v1_prefix)
app.include_router(vehicles_router, prefix=api_v1_prefix)
app.include_router(rescue_teams_router, prefix=api_v1_prefix)
app.include_router(resources_router, prefix=api_v1_prefix)
app.include_router(evacuations_router, prefix=api_v1_prefix)
app.include_router(dashboard_router, prefix=api_v1_prefix)
app.include_router(logs_router, prefix=api_v1_prefix)


@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "Operational",
        "documentation": "/docs",
        "api_prefix": settings.API_V1_STR
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT
    }
