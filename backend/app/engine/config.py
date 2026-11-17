"""Every tunable number the planner uses, in one place (FR-08 "configurable suitability factors").

The defaults below are what the lab runs use. To change them without touching code, put a
``planning.json`` next to ``alembic.ini`` (see ``backend/planning.example.json``); keys that are
missing keep their default.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path


@dataclass(frozen=True)
class PlanningConfig:
    # --- FR-06 priority: weights of the zone priority score (they add up to 1)
    priority_weights: dict[str, float] = field(
        default_factory=lambda: {"risk": 0.30, "priority_code": 0.25, "severity": 0.15, "population": 0.10, "vulnerable": 0.20}
    )
    disaster_severity_weight: dict[str, float] = field(default_factory=lambda: {"CRITICAL": 1.0, "HIGH": 0.8, "MEDIUM": 0.5, "LOW": 0.3})
    zone_risk_weight: dict[str, float] = field(default_factory=lambda: {"EXTREME": 1.0, "HIGH": 0.8, "MODERATE": 0.5, "LOW": 0.2})
    priority_code_weight: dict[str, float] = field(default_factory=lambda: {"P1": 1.0, "P2": 0.75, "P3": 0.5, "P4": 0.25})
    # A zone of this many remaining people gets the full population factor.
    population_scale: int = 1000

    # --- FR-08 ranking: cost per person in "weighted minutes"
    severity_weight: dict[int, float] = field(default_factory=lambda: {1: 1.0, 2: 1.25, 3: 1.5, 4: 2.0, 5: 2.5})
    # Blocked and Flooded are not here on purpose: those roads fail the hard constraint (FR-07).
    congestion_factor: dict[str, float] = field(default_factory=lambda: {"Open": 1.0, "Cleared": 1.15, "Congested": 1.6})
    risk_penalty: dict[str, float] = field(default_factory=lambda: {"Low": 0, "Moderate": 4, "High": 10, "Severe": 20})
    soft_facilities: tuple[str, ...] = ("Power", "Water", "Food")
    soft_facility_penalty: float = 8
    pet_penalty: float = 6
    utilization_threshold: float = 0.9
    utilization_penalty: float = 6
    stability_penalty_destination: float = 12
    stability_penalty_en_route: float = 40

    # --- shelters: walk-in reserve and the Open / Near full / Full display thresholds
    walk_in_reserve: float = 0.10
    near_full_threshold: float = 0.75
    full_threshold: float = 1.0

    # --- vehicles and timing
    loading_minutes: int = 5
    walk_speed_kmh: float = 4
    approach_speed_kmh: float = 22
    min_rebalance_gain_minutes: int = 8
    # FR-07 vehicle constraint: without a free vehicle a group may only walk out if nobody in it needs
    # medical care or wheelchair access and the road is at most this long.
    max_walk_km: float = 6.0

    def to_dict(self) -> dict:
        return asdict(self)


def load_planning_config(path: str | Path | None) -> PlanningConfig:
    """Defaults, overridden by whatever keys the JSON file sets."""
    base = PlanningConfig()
    if not path or not Path(path).exists():
        return base
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    known = {f.name for f in fields(PlanningConfig)}
    unknown = set(data) - known
    if unknown:
        raise ValueError(f"Unknown planning config keys: {sorted(unknown)}")
    if "severity_weight" in data:  # JSON keys are strings
        data["severity_weight"] = {int(k): v for k, v in data["severity_weight"].items()}
    if "soft_facilities" in data:
        data["soft_facilities"] = tuple(data["soft_facilities"])
    return replace(base, **data)
