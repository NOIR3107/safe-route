from typing import List
from app.models.disaster import AffectedZone, Disaster


class PriorityEngine:
    """
    FR-06: Calculate evacuation priority for affected populations.
    Combines disaster severity, zone risk level, zone priority category,
    and remaining population to sort zones in order of evacuation precedence.
    """

    SEVERITY_WEIGHTS = {
        "CRITICAL": 1.0,
        "HIGH": 0.8,
        "MEDIUM": 0.5,
        "LOW": 0.3
    }

    RISK_WEIGHTS = {
        "EXTREME": 1.0,
        "HIGH": 0.8,
        "MODERATE": 0.5,
        "LOW": 0.2
    }

    PRIORITY_LEVEL_WEIGHTS = {
        "P1": 1.0,
        "P2": 0.75,
        "P3": 0.5,
        "P4": 0.25
    }

    @classmethod
    def calculate_zone_priority_score(cls, zone: AffectedZone, disaster: Disaster) -> float:
        remaining_pop = max(0, zone.population - zone.evacuated_count)
        if remaining_pop <= 0:
            return 0.0

        sev_score = cls.SEVERITY_WEIGHTS.get(disaster.severity.upper(), 0.5)
        risk_score = cls.RISK_WEIGHTS.get(zone.risk_level.upper(), 0.5)
        
        # Parse P1/P2/P3/P4 if formatted as 'P1-Critical'
        pri_code = zone.priority.split("-")[0].strip().upper()
        pri_score = cls.PRIORITY_LEVEL_WEIGHTS.get(pri_code, 0.5)

        # Scale population influence logarithmically or proportionally
        pop_factor = min(1.0, remaining_pop / 1000.0)

        # Weighted composite score
        score = (0.35 * risk_score) + (0.30 * pri_score) + (0.20 * sev_score) + (0.15 * pop_factor)
        return round(score, 4)

    @classmethod
    def rank_zones_for_evacuation(cls, zones: List[AffectedZone], disaster: Disaster) -> List[tuple[AffectedZone, float]]:
        scored = []
        for zone in zones:
            score = cls.calculate_zone_priority_score(zone, disaster)
            scored.append((zone, score))
        # Sort descending by priority score
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored
