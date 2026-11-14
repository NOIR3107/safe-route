from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.disaster import Disaster, AffectedZone
from app.models.shelter import Shelter
from app.models.route import Route
from app.models.vehicle import Vehicle
from app.models.evacuation import EvacuationPlan, EvacuationAssignment, VehicleAssignment
from app.engines.priority_engine import PriorityEngine


class AllocationEngine:
    """
    Implements:
    - FR-07: Hard constraint checking for feasible shelters
    - FR-08: Configurable suitability scoring and ranking
    - FR-09: Evacuation assignment and vehicle allocation generation
    """

    ROUTE_RISK_PENALTY = {
        "LOW": 0.0,
        "MODERATE": 0.25,
        "HIGH": 0.60,
        "SEVERE": 1.0,
        "BLOCKED": 999.0,
        "FLOODED": 999.0
    }

    @classmethod
    def find_feasible_route(
        cls,
        routes: List[Route],
        zone_location: str,
        shelter_location: str
    ) -> Optional[Route]:
        """
        Hard constraint (FR-07): A shelter is only feasible if there is an open,
        unblocked route connecting the affected zone's location to the shelter.
        """
        z_loc = zone_location.strip().lower()
        s_loc = shelter_location.strip().lower()

        candidate_routes = []
        for r in routes:
            if r.status.upper() in ["BLOCKED", "FLOODED"]:
                continue
            r_src = r.source.strip().lower()
            r_dst = r.destination.strip().lower()

            # Check direct or bidirectional match
            if (r_src == z_loc and r_dst == s_loc) or (r_dst == z_loc and r_src == s_loc):
                candidate_routes.append(r)
            # Check substring match (e.g., "Sector 62" inside "Sector 62 Institutional Area")
            elif (r_src in z_loc or z_loc in r_src) and (r_dst in s_loc or s_loc in r_dst):
                candidate_routes.append(r)
            elif (r_dst in z_loc or z_loc in r_dst) and (r_src in s_loc or s_loc in r_src):
                candidate_routes.append(r)

        if candidate_routes:
            # Pick lowest risk, shortest travel time candidate
            candidate_routes.sort(key=lambda r: (cls.ROUTE_RISK_PENALTY.get(r.risk_level.upper(), 0.5), r.travel_time))
            return candidate_routes[0]

        return None

    @classmethod
    def calculate_shelter_suitability(
        cls,
        shelter: Shelter,
        route: Optional[Route],
        remaining_capacity: int
    ) -> float:
        """
        FR-08: Ranks feasible shelters using suitability factors:
        - Route distance / travel time
        - Route risk level
        - Available capacity headroom
        Higher score = More suitable.
        """
        if remaining_capacity <= 0 or shelter.status.upper() != "ACTIVE":
            return -1.0

        # Capacity score: more headroom provides a better buffer
        cap_score = min(1.0, remaining_capacity / max(1, shelter.capacity))

        if route:
            # Distance / travel time penalty (assume 60 min is threshold)
            time_penalty = min(1.0, route.travel_time / 60.0)
            risk_penalty = cls.ROUTE_RISK_PENALTY.get(route.risk_level.upper(), 0.3)
        else:
            time_penalty = 0.5
            risk_penalty = 0.5

        # Weighted composite suitability score (higher is better)
        suitability = (0.45 * cap_score) + (0.35 * (1.0 - time_penalty)) + (0.20 * (1.0 - risk_penalty))
        return max(0.0, suitability)

    @classmethod
    def generate_plan(
        cls,
        db: Session,
        plan: EvacuationPlan,
        disaster: Disaster,
        zones: List[AffectedZone],
        shelters: List[Shelter],
        routes: List[Route],
        vehicles: List[Vehicle]
    ) -> List[EvacuationAssignment]:
        """
        FR-07, FR-08, FR-09: Executes the end-to-end allocation pipeline.
        """
        # 1. Rank zones by evacuation priority (FR-06)
        ranked_zones = PriorityEngine.rank_zones_for_evacuation(zones, disaster)

        # Track remaining dynamic capacity for each shelter
        shelter_capacities: Dict[int, int] = {
            s.shelter_id: max(0, s.capacity - s.current_occupancy)
            for s in shelters if s.status.upper() == "ACTIVE"
        }

        # Available vehicles pool
        available_vehicles = [v for v in vehicles if v.status.upper() == "AVAILABLE"]

        created_assignments: List[EvacuationAssignment] = []

        for zone, _score in ranked_zones:
            people_to_evacuate = zone.population - zone.evacuated_count
            if people_to_evacuate <= 0:
                continue

            # Evaluate feasible shelters (FR-07, FR-08)
            candidate_shelters: List[Tuple[Shelter, Optional[Route], float]] = []
            for s in shelters:
                rem_cap = shelter_capacities.get(s.shelter_id, 0)
                if rem_cap <= 0:
                    continue
                route = cls.find_feasible_route(routes, zone.location, s.location)
                if route is None and routes:
                    # If routes exist but none are open/accessible, hard constraint fails
                    continue

                suitability = cls.calculate_shelter_suitability(s, route, rem_cap)
                if suitability > 0:
                    candidate_shelters.append((s, route, suitability))

            # Rank candidate shelters descending by suitability
            candidate_shelters.sort(key=lambda item: item[2], reverse=True)

            # Allocate evacuees across best available shelters
            for shelter, route, _suitability in candidate_shelters:
                if people_to_evacuate <= 0:
                    break

                rem_cap = shelter_capacities[shelter.shelter_id]
                if rem_cap <= 0:
                    continue

                batch_count = min(people_to_evacuate, rem_cap)

                assignment = EvacuationAssignment(
                    plan_id=plan.plan_id,
                    zone_id=zone.zone_id,
                    shelter_id=shelter.shelter_id,
                    route_id=route.route_id if route else None,
                    people_count=batch_count,
                    status="Scheduled"
                )
                db.add(assignment)
                db.flush()  # to obtain assignment.assignment_id

                # Assign available vehicles to transport evacuees
                passengers_needed = batch_count
                for v in list(available_vehicles):
                    if passengers_needed <= 0:
                        break
                    v_assign = VehicleAssignment(
                        assignment_id=assignment.assignment_id,
                        vehicle_id=v.vehicle_id,
                        status="Assigned"
                    )
                    db.add(v_assign)
                    v.status = "Assigned"
                    available_vehicles.remove(v)
                    passengers_needed -= v.capacity

                # Update state
                shelter_capacities[shelter.shelter_id] -= batch_count
                shelter.current_occupancy += batch_count
                zone.evacuated_count += batch_count
                people_to_evacuate -= batch_count

                created_assignments.append(assignment)

            if zone.evacuated_count >= zone.population:
                zone.status = "Evacuated"
            elif zone.evacuated_count > 0:
                zone.status = "Partially Evacuated"

        plan.status = "Active"
        db.commit()
        return created_assignments
