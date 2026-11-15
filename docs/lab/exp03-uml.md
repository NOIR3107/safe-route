# Experiment 3 – UML diagrams

The hand-drawn versions are in our lab file. These are the same diagrams kept as code (Mermaid), so
they stay next to the source and are easy to update when the design changes.

## A. Use case diagram

```mermaid
flowchart LR
  EA([Emergency Authority / Incident Commander])
  EC([Evacuation Coordinator])
  SM([Shelter Manager])
  TC([Transport Coordinator])
  RT([Response / Field Team])
  AD([Administrator])
  PU([Public / Evacuee])

  subgraph SafeRoute
    UC1(Manage disaster)
    UC2(Manage affected zones)
    UC3(Manage shelters)
    UC4(Manage routes)
    UC5(Manage vehicles & teams)
    UC6(Generate evacuation plan)
    UC7(Explain assignment)
    UC8(Approve / override plan)
    UC9(Re-plan on events)
    UC10(Run drill)
    UC11(Shelter check-in & reunification)
    UC12(Confirm pickups offline)
    UC13(Monitor dashboard / 3D view)
    UC14(View audit log)
    UC15(Manage users)
    UC16(Look up my shelter)
  end

  EA --- UC1 & UC2 & UC8 & UC13 & UC14
  EC --- UC2 & UC6 & UC8 & UC10 & UC13
  SM --- UC3 & UC11
  TC --- UC4 & UC5 & UC13
  RT --- UC12
  AD --- UC15 & UC14
  PU --- UC16
  UC6 -. include .-> UC7
  UC9 -. extend .-> UC6
  UC1 -. include .-> UC2
```

## B. Class diagram (core domain, matches `app/models`)

```mermaid
classDiagram
  class User {
    +int user_id
    +str name
    +str email
    +str role
    +str phone_number
    +bool is_active
  }
  class Disaster {
    +int disaster_id
    +str type
    +str title
    +str severity
    +str status
    +datetime start_date
  }
  class AffectedZone {
    +int zone_id
    +str name
    +str location
    +int population
    +str priority
    +str risk_level
    +int evacuated_count
    +str status
  }
  class Shelter {
    +int shelter_id
    +str name
    +str location
    +int capacity
    +int current_occupancy
    +str facilities
    +str status
  }
  class ShelterFacility {
    +int facility_id
    +str facility_type
    +str availability_status
  }
  class Route {
    +int route_id
    +str source
    +str destination
    +float distance_km
    +float travel_time
    +str risk_level
    +str status
  }
  class Vehicle {
    +int vehicle_id
    +str vehicle_type
    +int capacity
    +str status
    +str current_location
  }
  class RescueTeam {
    +int team_id
    +str name
    +int members_count
    +str status
  }
  class EvacuationPlan {
    +int plan_id
    +str name
    +str status
    +generate()
    +reallocate()
  }
  class EvacuationAssignment {
    +int assignment_id
    +int people_count
    +str status
  }
  class VehicleAssignment {
    +datetime departure_time
    +datetime arrival_time
    +str status
  }
  class Notification {
    +str message
    +str type
    +str status
  }
  class AuditLog {
    +str action
    +str entity_type
    +str details
    +datetime timestamp
  }
  class PriorityEngine {
    +calculate_zone_priority_score()
    +rank_zones_for_evacuation()
  }
  class AllocationEngine {
    +find_feasible_route()
    +calculate_shelter_suitability()
    +generate_plan()
  }
  class ReplanningEngine {
    +handle_contingency()
  }

  Disaster "1" --> "*" AffectedZone : affects
  Disaster "1" --> "*" EvacuationPlan : has
  User "1" --> "*" EvacuationPlan : creates
  EvacuationPlan "1" *-- "*" EvacuationAssignment
  EvacuationAssignment "*" --> "1" AffectedZone : from
  EvacuationAssignment "*" --> "1" Shelter : to
  EvacuationAssignment "*" --> "0..1" Route : via
  EvacuationAssignment "1" *-- "*" VehicleAssignment
  VehicleAssignment "*" --> "1" Vehicle : uses
  Shelter "1" *-- "*" ShelterFacility
  User "1" --> "*" Notification : receives
  User "1" --> "*" AuditLog : generates
  AllocationEngine ..> PriorityEngine : uses
  ReplanningEngine ..> AllocationEngine : uses
```

## C. Activity diagram – generate an evacuation plan

```mermaid
flowchart TD
  A([Start]) --> B[Receive disaster and zone data]
  B --> C[Calculate priority for each zone]
  C --> D[Load shelters, routes, vehicles]
  D --> E[Remove infeasible options:<br/>closed/full shelters, blocked routes,<br/>missing medical/accessibility]
  E --> F{Any feasible shelter<br/>for this group?}
  F -- No --> G[Mark group unallocated<br/>with the reason]
  F -- Yes --> H[Score shelters: travel time × severity<br/>+ risk + facility penalties]
  H --> I[Allocate whole households<br/>Greedy or Min-Cost Flow]
  I --> J[Assign vehicles, compute ETA]
  G --> K
  J --> K[Store plan version v1 as Proposed]
  K --> L[Notify coordinator, write audit log]
  L --> M{Coordinator decision}
  M -- Approve --> N([Plan approved])
  M -- Override with reason --> O[New version, logged] --> N
```

## D. Sequence diagram – create a plan

```mermaid
sequenceDiagram
  actor C as Coordinator
  participant UI as React frontend
  participant API as FastAPI router
  participant S as EvacuationService
  participant E as AllocationEngine
  participant DB as Database

  C->>UI: Generate plan
  UI->>API: POST /api/v1/evacuations/generate
  API->>API: require_roles(Authority, Coordinator)
  API->>S: generate_evacuation_plan()
  S->>DB: load zones, shelters, routes, vehicles
  S->>E: generate_plan(...)
  E->>E: rank zones (PriorityEngine)
  E->>E: filter + score shelters, allocate
  E-->>S: assignments
  S->>DB: save plan + assignments, audit log
  S-->>API: EvacuationPlan
  API-->>UI: 201 plan JSON
  UI-->>C: table + "Why this shelter?"
```

## E. Sequence diagram – re-plan when a bridge floods

```mermaid
sequenceDiagram
  actor T as Transport Coordinator
  participant UI as React frontend
  participant API as FastAPI
  participant R as ReplanningEngine
  participant DB as Database

  T->>UI: Mark route as Blocked (reason)
  UI->>API: PUT /routes/{id} {status: Blocked}
  UI->>API: POST /evacuations/reallocate {plan_id, blocked_route_id}
  API->>R: handle_contingency()
  R->>DB: find assignments on that route
  R->>DB: release shelter places + vehicles
  R->>R: re-run allocation for displaced people only
  R->>DB: new assignments, old ones marked Rerouted
  R->>DB: AuditLog DYNAMIC_REALLOCATION + CRITICAL notification
  API-->>UI: new assignments
  UI-->>T: new plan version with diff (who moved, why, ΔETA)
```
