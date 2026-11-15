# Experiment 5 – Database design (ER diagram and relational schema)

PostgreSQL in production, SQLite for local development and tests. Tables are created from the
SQLAlchemy models in `app/models` (`Base.metadata.create_all`).

## ER diagram

```mermaid
erDiagram
  USERS ||--o{ EVACUATION_PLANS : creates
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AUDIT_LOGS : generates
  DISASTERS ||--o{ AFFECTED_ZONES : affects
  DISASTERS ||--o{ EVACUATION_PLANS : has
  EVACUATION_PLANS ||--o{ EVACUATION_ASSIGNMENTS : contains
  AFFECTED_ZONES ||--o{ EVACUATION_ASSIGNMENTS : "people from"
  SHELTERS ||--o{ EVACUATION_ASSIGNMENTS : "people to"
  ROUTES |o--o{ EVACUATION_ASSIGNMENTS : via
  EVACUATION_ASSIGNMENTS ||--o{ VEHICLE_ASSIGNMENTS : uses
  VEHICLES ||--o{ VEHICLE_ASSIGNMENTS : assigned
  SHELTERS ||--o{ SHELTER_FACILITIES : has

  USERS {
    int user_id PK
    string name
    string email UK
    string hashed_password
    string role
    string phone_number
    bool is_active
    datetime created_at
  }
  DISASTERS {
    int disaster_id PK
    string type
    string title
    string severity
    string status
    datetime start_date
    datetime end_date
  }
  AFFECTED_ZONES {
    int zone_id PK
    int disaster_id FK
    string name
    string location
    int population
    string priority
    string risk_level
    int evacuated_count
    string status
  }
  SHELTERS {
    int shelter_id PK
    string name
    string location
    int capacity
    int current_occupancy
    string facilities
    string status
    float latitude
    float longitude
  }
  SHELTER_FACILITIES {
    int facility_id PK
    int shelter_id FK
    string facility_type
    int capacity
    string availability_status
  }
  ROUTES {
    int route_id PK
    string source
    string destination
    float distance_km
    float travel_time
    string risk_level
    string status
  }
  VEHICLES {
    int vehicle_id PK
    string vehicle_type
    int capacity
    string status
    string current_location
    string plate_number
  }
  RESCUE_TEAMS {
    int team_id PK
    string name
    int members_count
    string contact_number
    string status
  }
  RESOURCES {
    int resource_id PK
    string resource_type
    int quantity
    string availability
  }
  EVACUATION_PLANS {
    int plan_id PK
    int disaster_id FK
    int created_by FK
    string name
    string status
    string priority
  }
  EVACUATION_ASSIGNMENTS {
    int assignment_id PK
    int plan_id FK
    int zone_id FK
    int shelter_id FK
    int route_id FK
    int people_count
    string status
  }
  VEHICLE_ASSIGNMENTS {
    int vehicle_assignment_id PK
    int assignment_id FK
    int vehicle_id FK
    datetime departure_time
    datetime arrival_time
    string status
  }
  NOTIFICATIONS {
    int notification_id PK
    int user_id FK
    string message
    string type
    string status
  }
  AUDIT_LOGS {
    int log_id PK
    int user_id FK
    string action
    string entity_type
    int entity_id
    string details
  }
```

## Constraints actually enforced

| Table | Constraint |
|---|---|
| users | `email` UNIQUE, NOT NULL; password stored only as a bcrypt hash |
| affected_zones | `population >= 0`, `evacuated_count >= 0`; FK → disasters |
| shelters | `capacity > 0`, `current_occupancy >= 0`, **`current_occupancy <= capacity`** |
| routes | `distance_km > 0`, `travel_time >= 0` |
| vehicles | `capacity > 0` |
| rescue_teams | `members_count > 0` |
| resources | `quantity >= 0` |
| evacuation_assignments | `people_count > 0`; FKs → plans, zones, shelters, routes |

Pydantic schemas repeat the same rules at the API boundary (e.g. `capacity: int = Field(gt=0)`), so bad
input gets a 422 before it reaches the database. `tests/test_reallocation_api.py` checks this.

## Normalisation

* **1NF:** every column holds one value; vehicles, facilities and assignments live in their own tables
  instead of lists inside a row. (`shelters.facilities` is kept as a display summary; the queryable
  version is the `shelter_facilities` table.)
* **2NF:** all tables use a single-column surrogate key, so there are no partial dependencies.
* **3NF:** non-key columns depend only on the key. A zone stores `disaster_id`, not the disaster's title
  or severity, so changing the disaster updates it everywhere. Assignments refer to the shelter and
  route by id instead of copying their names.

Planned arrivals are not stored as occupancy: `current_occupancy` is people physically present, and
"inbound" is computed from active assignments. That avoids two values that could drift apart.

## Extension tables (proposed)

The frontend needs a few extra records (zone geometry, households, plan versions, explanations).
They are keyed by the existing primary keys and listed in [`docs/api-extensions.md`](../api-extensions.md).
