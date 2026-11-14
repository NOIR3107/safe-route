# SafeRoute – Software Engineering UML & Design Diagrams

## 1. Use Case Diagram
```mermaid
flowchart LR
    EA["Emergency Authority"]
    EC["Evacuation Coordinator"]
    SM["Shelter Manager"]
    TC["Transport Coordinator"]
    RT["Response Team"]
    Admin["System Administrator"]

    subgraph SafeRoute_System ["SafeRoute Disaster Evacuation & Shelter Allocation System"]
        UC1((Manage Disaster))
        UC2((Manage Affected Zones))
        UC3((Manage Shelters))
        UC4((Manage Routes))
        UC5((Manage Resources))
        UC6((Generate Evacuation Plan))
        UC7((Reallocate Evacuees))
        UC8((Monitor Dashboard))
        UC9((Manage Users))
        UC10((View Audit Logs))
    end

    EA --> UC1
    EA --> UC2
    EA --> UC8
    EC --> UC6
    EC --> UC7
    EC --> UC8
    SM --> UC3
    SM --> UC5
    TC --> UC4
    TC --> UC5
    RT --> UC7
    Admin --> UC9
    Admin --> UC10

    UC1 -.->|include| UC2
    UC6 -.->|include| UC3
    UC6 -.->|include| UC4
    UC6 -.->|include| UC5
    UC6 -.->|extend| UC7
```

---

## 2. Class Diagram
```mermaid
classDiagram
    class User {
        +int user_id
        +string name
        +string email
        +string hashed_password
        +string role
        +string phone_number
        +boolean is_active
        +datetime created_at
        +login()
        +logout()
        +updateProfile()
    }

    class Disaster {
        +int disaster_id
        +string type
        +string title
        +string description
        +string severity
        +string status
        +datetime start_date
        +datetime end_date
        +addAffectedZone()
        +updateStatus()
    }

    class AffectedZone {
        +int zone_id
        +int disaster_id
        +string name
        +string location
        +int population
        +string priority
        +string risk_level
        +int evacuated_count
        +string status
        +getPriorityScore()
    }

    class Shelter {
        +int shelter_id
        +string name
        +string location
        +int capacity
        +int current_occupancy
        +string facilities
        +string status
        +getAvailableCapacity()
    }

    class ShelterFacility {
        +int facility_id
        +int shelter_id
        +string facility_type
        +int capacity
        +string availability_status
    }

    class Route {
        +int route_id
        +string source
        +string destination
        +float distance_km
        +float travel_time
        +string risk_level
        +string status
        +calculateRisk()
        +updateStatus()
    }

    class Vehicle {
        +int vehicle_id
        +string vehicle_type
        +int capacity
        +string status
        +string current_location
        +assignToRoute()
    }

    class RescueTeam {
        +int team_id
        +string name
        +int members_count
        +string contact_number
        +string status
        +deploy()
    }

    class EvacuationPlan {
        +int plan_id
        +int disaster_id
        +int created_by
        +string name
        +string status
        +string priority
        +datetime created_at
        +generate()
        +reallocate()
    }

    class EvacuationAssignment {
        +int assignment_id
        +int plan_id
        +int zone_id
        +int shelter_id
        +int route_id
        +int people_count
        +string status
    }

    class VehicleAssignment {
        +int vehicle_assignment_id
        +int assignment_id
        +int vehicle_id
        +datetime departure_time
        +datetime arrival_time
        +string status
    }

    class Notification {
        +int notification_id
        +int user_id
        +string message
        +string type
        +string status
        +datetime timestamp
    }

    class AuditLog {
        +int log_id
        +int user_id
        +string action
        +string entity_type
        +int entity_id
        +datetime timestamp
    }

    User "1" --> "*" Disaster : manages
    User "1" --> "*" EvacuationPlan : creates
    Disaster "1" *-- "*" AffectedZone : contains
    Disaster "1" --> "*" EvacuationPlan : subject_of
    Shelter "1" *-- "*" ShelterFacility : has
    EvacuationPlan "1" *-- "*" EvacuationAssignment : contains
    AffectedZone "1" <-- EvacuationAssignment : evacuates
    Shelter "1" <-- EvacuationAssignment : shelters_at
    Route "0..1" <-- EvacuationAssignment : passes_via
    EvacuationAssignment "1" *-- "*" VehicleAssignment : binds
    Vehicle "1" <-- VehicleAssignment : transports_with
    User "1" --> "*" Notification : receives
    User "1" --> "*" AuditLog : logs
```

---

## 3. Activity Diagram – Generate Evacuation Plan
```mermaid
flowchart TD
    Start([Start]) --> Recv[Receive Disaster and Zone Information]
    Recv --> CalcPri[Calculate Evacuation Priority for Zones - FR-06]
    CalcPri --> Retr[Retrieve Active Shelters and Open Routes]
    Retr --> Filter[Filter Options via Hard Constraints - FR-07]
    Filter --> Decision{Any Available Options?}
    Decision -- No --> AlertWait[Alert Coordinators & Wait for Resources]
    AlertWait --> Filter
    Decision -- Yes --> Suitability[Calculate Shelter Suitability & Rank - FR-08]
    Suitability --> FeasibleRoute[Select Lowest Risk, Open Route]
    FeasibleRoute --> AllocPop[Allocate Population Batch up to Remaining Capacity]
    AllocPop --> AssignRes[Assign Available Vehicles and Rescue Teams]
    AssignRes --> StorePlan[Persist Plan & Assignments in Database]
    StorePlan --> Notify[Dispatch Notifications & Audit Logs - FR-12]
    Notify --> End([End])
```

---

## 4. Sequence Diagram – Create Evacuation Plan
```mermaid
sequenceDiagram
    autonumber
    actor Coordinator
    participant API as FastAPI REST API
    participant EvacService as EvacuationService
    participant AllocEngine as AllocationEngine
    participant ShelterRepo as ShelterRepository
    participant RouteRepo as RouteRepository
    participant VehicleRepo as VehicleRepository
    participant DB as PostgreSQL / SQLite Database

    Coordinator->>API: POST /api/v1/evacuations/generate
    API->>EvacService: generate_evacuation_plan(req, user_id)
    EvacService->>AllocEngine: generate_plan(plan, disaster, zones)
    AllocEngine->>ShelterRepo: getActiveShelters()
    ShelterRepo-->>AllocEngine: active shelters list
    AllocEngine->>RouteRepo: getOpenRoutes()
    RouteRepo-->>AllocEngine: open routes list
    AllocEngine->>VehicleRepo: getAvailableVehicles()
    VehicleRepo-->>AllocEngine: available vehicles list
    AllocEngine->>AllocEngine: rankZones() & scoreShelters()
    AllocEngine->>DB: save plan, assignments & vehicle bindings
    DB-->>AllocEngine: commit success
    AllocEngine-->>EvacService: return generated plan
    EvacService->>DB: log audit event & create notification
    EvacService-->>API: EvacuationPlanResponse
    API-->>Coordinator: 201 Created (Evacuation Plan Details)
```

---

## 5. Architectural Design (Layered Architecture)
```mermaid
graph TD
    subgraph Presentation_Layer ["Presentation Layer"]
        UI["React Frontend Dashboard (Vite / React Router)"]
        Swagger["OpenAPI / Swagger Interactive Documentation (/docs)"]
    end

    subgraph API_Layer ["REST API Layer (FastAPI)"]
        Router["FastAPI Routers (/api/v1/...)"]
        AuthMiddleware["OAuth2 & JWT RBAC Middleware"]
    end

    subgraph Application_Services ["Application Services Layer"]
        AS1[DisasterService]
        AS2[ShelterService]
        AS3[RouteService]
        AS4[ResourceService]
        AS5[EvacuationService]
        AS6[AuthService]
        AS7[AuditService]
    end

    subgraph Decision_Planning_Layer ["Decision / Planning Engines"]
        PE[PriorityEngine - FR-06]
        AE[AllocationEngine - FR-07, FR-08, FR-09]
        RE[ReplanningEngine - FR-10]
    end

    subgraph Data_Access_Layer ["Data Access & ORM Layer"]
        ORM[SQLAlchemy ORM 2.0]
        Session[Scoped Session Local]
    end

    subgraph Database_Layer ["Database Layer"]
        PG[(PostgreSQL / SQLite)]
    end

    UI -->|JSON / REST| Router
    Swagger -->|JSON / REST| Router
    Router --> AuthMiddleware
    AuthMiddleware --> Application_Services
    Application_Services --> Decision_Planning_Layer
    Decision_Planning_Layer --> Data_Access_Layer
    Application_Services --> Data_Access_Layer
    Data_Access_Layer --> Database_Layer
```

---

## 6. Entity-Relationship (ER) Diagram
```mermaid
erDiagram
    USER ||--o{ EVACUATION_PLAN : creates
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : triggers
    DISASTER ||--|{ AFFECTED_ZONE : affects
    DISASTER ||--o{ EVACUATION_PLAN : triggers
    SHELTER ||--o{ SHELTER_FACILITY : contains
    EVACUATION_PLAN ||--|{ EVACUATION_ASSIGNMENT : contains
    AFFECTED_ZONE ||--o{ EVACUATION_ASSIGNMENT : evacuated_to
    SHELTER ||--o{ EVACUATION_ASSIGNMENT : houses
    ROUTE ||--o{ EVACUATION_ASSIGNMENT : traversed_by
    EVACUATION_ASSIGNMENT ||--o{ VEHICLE_ASSIGNMENT : utilizes
    VEHICLE ||--o{ VEHICLE_ASSIGNMENT : assigned_to

    USER {
        int user_id PK
        string name
        string email UK
        string hashed_password
        string role
        string phone_number
        boolean is_active
        datetime created_at
    }

    DISASTER {
        int disaster_id PK
        string type
        string title
        string description
        string severity
        string status
        datetime start_date
        datetime end_date
        datetime created_at
    }

    AFFECTED_ZONE {
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

    SHELTER {
        int shelter_id PK
        string name
        string location
        int capacity
        int current_occupancy
        string facilities
        string status
    }

    SHELTER_FACILITY {
        int facility_id PK
        int shelter_id FK
        string facility_type
        int capacity
        string availability_status
    }

    ROUTE {
        int route_id PK
        string source
        string destination
        float distance_km
        float travel_time
        string risk_level
        string status
    }

    VEHICLE {
        int vehicle_id PK
        string vehicle_type
        int capacity
        string status
        string current_location
    }

    RESCUE_TEAM {
        int team_id PK
        string name
        int members_count
        string contact_number
        string status
    }

    EVACUATION_PLAN {
        int plan_id PK
        int disaster_id FK
        int created_by FK
        string name
        string status
        string priority
        datetime created_at
        datetime updated_at
    }

    EVACUATION_ASSIGNMENT {
        int assignment_id PK
        int plan_id FK
        int zone_id FK
        int shelter_id FK
        int route_id FK
        int people_count
        string status
        datetime created_at
    }

    VEHICLE_ASSIGNMENT {
        int vehicle_assignment_id PK
        int assignment_id FK
        int vehicle_id FK
        datetime departure_time
        datetime arrival_time
        string status
    }

    RESOURCE {
        int resource_id PK
        string resource_type
        int quantity
        string availability
        string location
    }

    NOTIFICATION {
        int notification_id PK
        int user_id FK
        string message
        string type
        string status
        datetime timestamp
    }

    AUDIT_LOG {
        int log_id PK
        int user_id FK
        string action
        string entity_type
        int entity_id
        string details
        datetime timestamp
    }
```
