"""FR-06: evacuation priority of a zone.

score = w_risk * risk + w_code * priority code + w_sev * disaster severity
      + w_pop * min(1, remaining / population_scale) + w_vuln * vulnerable share

The vulnerable share is the fraction of people still waiting who are elderly, disabled, children or
need medical care, so a zone with many vulnerable residents moves up the list.
"""

from __future__ import annotations

from .config import PlanningConfig
from .model import EngineHousehold, EngineZone


def zone_priority_score(zone: EngineZone, disaster_severity: str, cfg: PlanningConfig) -> float:
    remaining = max(0, zone.population - zone.evacuated_count)
    if remaining <= 0:
        return 0.0
    w = cfg.priority_weights
    risk = cfg.zone_risk_weight.get(zone.risk_level.upper(), 0.5)
    code = cfg.priority_code_weight.get(zone.priority.split("-")[0].strip().upper(), 0.5)
    sev = cfg.disaster_severity_weight.get(disaster_severity.upper(), 0.5)
    pop = min(1.0, remaining / cfg.population_scale)
    vulnerable = min(1.0, zone.vulnerable_people / remaining)
    score = w["risk"] * risk + w["priority_code"] * code + w["severity"] * sev + w["population"] * pop + w["vulnerable"] * vulnerable
    return round(score, 4)


def is_high_priority(h: EngineHousehold, zone_severity: int) -> bool:
    """Counted in the "high-priority served" KPI: severe zones, medical needs or disability."""
    return zone_severity >= 4 or "Medical" in h.needs or "Accessibility" in h.needs
