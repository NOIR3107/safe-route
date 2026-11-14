from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.disasters import router as disasters_router
from app.routers.zones import router as zones_router
from app.routers.shelters import router as shelters_router
from app.routers.routes import router as routes_router
from app.routers.vehicles import router as vehicles_router
from app.routers.rescue_teams import router as rescue_teams_router
from app.routers.resources import router as resources_router
from app.routers.evacuations import router as evacuations_router
from app.routers.dashboard import router as dashboard_router
from app.routers.logs import router as logs_router

__all__ = [
    "auth_router",
    "users_router",
    "disasters_router",
    "zones_router",
    "shelters_router",
    "routes_router",
    "vehicles_router",
    "rescue_teams_router",
    "resources_router",
    "evacuations_router",
    "dashboard_router",
    "logs_router",
]
