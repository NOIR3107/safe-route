# SafeRoute – Disaster Evacuation & Shelter Allocation System
### Backend Service & Decision Engine
**JSS University, Noida | Department of Computer Science & Engineering (AI/ML)**

---

---

## 📌 Component Overview
This repository contains the complete **Backend Application Service** for **SafeRoute**, a web-based decision-support system designed to assist emergency management authorities in coordinating post-disaster evacuations during floods, earthquakes, industrial fires, and cyclones.

The backend is built using **Python and FastAPI**, exposing modular REST APIs and executing core decision algorithms to calculate evacuation priorities, match populations to feasible shelters, and dynamically reroute evacuees when routes or shelters become compromised.

---

## 🖥️ Frontend (React command centre)

The `frontend/` folder has the SafeRoute web app: dashboard with a live map, allocation plans that explain
themselves (Greedy vs Min-Cost Flow), plan versions with diffs, a Chennai flood drill, CRUD screens, shelter
check-in, an offline Field Team app, a public page in English/Hindi/Tamil, and a 3D view built on
[god's-eye-view](https://github.com/bilawalsidhu/gods-eye-view) (git submodule in `integrations/gods-eye-view`).

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173, works with built-in demo data, no backend needed
```

Set `VITE_API_MODE=live` in `frontend/.env` to use this FastAPI backend instead. More in
**[frontend/README.md](frontend/README.md)** (demo, screenshots, 3D globe setup) and
**[docs/api-extensions.md](docs/api-extensions.md)** (endpoints the new features need).

📚 Lab write-ups for all 13 experiments: **[docs/lab](docs/lab/README.md)** · How we work: **[CONTRIBUTING.md](CONTRIBUTING.md)**

![SafeRoute Command Dashboard](docs/screenshots/02-dashboard.png)

---

## ⚙️ Backend Architecture & Core Features

```
Client (Frontend / API Consumer)
        │
        ▼  [JSON / REST over HTTP]
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Application                       │
│  - JWT Bearer Authentication & RBAC Middleware              │
│  - CORS Middleware & Request Validation                     │
├─────────────────────────────────────────────────────────────┤
│                       API Routers                           │
│  /api/v1/auth          /api/v1/users         /api/v1/logs   │
│  /api/v1/disasters     /api/v1/zones         /api/v1/routes │
│  /api/v1/shelters      /api/v1/vehicles      /api/v1/teams  │
│  /api/v1/evacuations   /api/v1/dashboard     /api/v1/res    │
├─────────────────────────────────────────────────────────────┤
│                   Application Services                      │
│  DisasterService   ShelterService   RouteService            │
│  ResourceService   EvacuationService AuthService            │
├─────────────────────────────────────────────────────────────┤
│                 Decision & Planning Engines                 │
│  1. Priority Engine (FR-06): Composite Urgency Scoring      │
│  2. Allocation Engine (FR-07/08/09): Constraint Matching    │
│  3. Replanning Engine (FR-10): Contingency Rerouting        │
├─────────────────────────────────────────────────────────────┤
│                      ORM & Data Layer                       │
│  SQLAlchemy 2.0 Engine & Scoped Sessions                    │
└─────────────────────────────────────────────────────────────┘
```

### 1. Decision & Planning Engines
- **Priority Calculation Engine (`app/engines/priority_engine.py` - FR-06)**: Calculates priority ranking for affected zones using weighted composite scoring based on disaster severity, local risk levels, urgency codes, and population density.
- **Constraint-Based Allocation Engine (`app/engines/allocation_engine.py` - FR-07, FR-08, FR-09)**: Enforces hard constraints (excludes full shelters and blocked routes) and ranks candidate shelters by travel time, route risk, and capacity headroom.
- **Dynamic Replanning Engine (`app/engines/replanning_engine.py` - FR-10)**: Real-time reallocation when a route becomes blocked or a shelter reaches full capacity, safely rerouting evacuees and releasing previous resource locks.

### 2. Role-Based Access Control (RBAC - FR-11)
- Fine-grained endpoint permissions using JWT Bearer authentication.
- Supports roles: `Admin`, `Emergency Authority`, `Evacuation Coordinator`, `Shelter Manager`, `Transport Coordinator`, and `Response Team`.

### 3. Real-Time Emergency Dashboard (`/api/v1/dashboard/summary`)
- Real-time aggregated statistics on disaster status, total population evacuated vs. affected, shelter occupancy rate, and active logistics.

---

## 🛠️ Technology Stack

| Component | Technology |
| :--- | :--- |
| **Backend Framework** | Python 3.11+ & FastAPI |
| **ASGI Web Server** | Uvicorn |
| **Data Validation** | Pydantic v2 |
| **ORM** | SQLAlchemy 2.0 |
| **Database** | SQLite (default local) / PostgreSQL (production) |
| **Security & Auth** | PyJWT + Bcrypt (salted password hashing) |

---

## 📁 Backend Directory Structure

```
SafeRoute-Backend/
├── app/
│   ├── core/
│   │   ├── database.py            # SQLAlchemy engine & session maker
│   │   ├── dependencies.py        # RBAC and JWT user validation
│   │   └── security.py            # Password hashing & JWT utilities
│   ├── engines/
│   │   ├── priority_engine.py     # FR-06 Population priority calculation
│   │   ├── allocation_engine.py   # FR-07/08/09 Constraint-based allocation
│   │   └── replanning_engine.py   # FR-10 Dynamic contingency replanning
│   ├── models/                    # SQLAlchemy database entity models
│   ├── routers/                   # Modular REST API endpoints
│   ├── schemas/                   # Pydantic v2 request/response models
│   ├── services/                  # Application business services
│   ├── config.py                  # Environment settings & configuration
│   └── main.py                    # FastAPI application initialization
├── tests/                         # PyTest suite (unit + API integration)
├── frontend/                      # React + TypeScript web app
├── integrations/gods-eye-view/    # 3D globe (git submodule, MIT)
├── docs/                          # Lab write-ups, API extension spec, screenshots
├── .github/                       # CI workflows, PR template
├── .env.example
├── .gitignore
├── requirements.txt
├── requirements-dev.txt           # + pytest, httpx, pytest-cov
├── pytest.ini
├── run.py                         # Startup script
├── CONTRIBUTING.md
└── README.md
```

---

## 🚀 How to Run the Backend Locally

### 1. Setup Environment
```bash
# Clone the repository
git clone https://github.com/akshitaupadhyay/SafeRoute-Backend.git
cd SafeRoute-Backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(SQLite is preconfigured by default at `sqlite:///./saferoute.db`, so the backend runs immediately without configuring an external database server).*

### 3. Start the Server
```bash
python run.py
```
Or using Uvicorn directly:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Run the Tests
```bash
pip install -r requirements-dev.txt
pytest                      # 36 tests, in-memory SQLite
pytest --cov=app            # with coverage (~86%)
```

---

## 📖 API Documentation & Endpoints

Once the server is running, you can explore and test all endpoints using FastAPI's interactive Swagger UI:
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`

### Key Endpoints:
- `POST /api/v1/auth/login` - User login and JWT access token issuance
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/disasters/` - List disaster incidents
- `POST /api/v1/disasters/` - Create a disaster incident
- `POST /api/v1/zones/` - Register affected zone
- `POST /api/v1/shelters/` - Register shelter and capacity
- `POST /api/v1/routes/` - Register evacuation route and condition
- `POST /api/v1/evacuations/generate` - Run the automated shelter allocation engine
- `POST /api/v1/evacuations/reallocate` - Trigger dynamic contingency replanning
- `GET /api/v1/dashboard/summary` - Aggregated monitoring metrics

---

## 🔑 Default Seeded Credentials for Testing

| Role | Email | Password |
| :--- | :--- | :--- |
| **System Administrator** | `admin@saferoute.org` | `Admin@12345` |
| **Evacuation Coordinator** | `coordinator@saferoute.org` | `Coord@12345` |
