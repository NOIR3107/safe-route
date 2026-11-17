"""Shelter status shown to people: Open / Near Full / Full / Closed.

Worked out from real numbers with the thresholds in PlanningConfig:

    load = (people present + people on their way) / capacity
    Closed     manager closed it (or it is inactive)
    Full       manager marked it full, or load >= full_threshold (100 %)
    Near Full  load >= near_full_threshold (75 %)
    Open       otherwise

The 10 % walk-in reserve does NOT make a shelter "Full": a shelter at 90 % with only its reserve
left is Near Full, and the planner simply has no plannable seats there.
"""

from __future__ import annotations

from .config import PlanningConfig


def shelter_display_status(status: str, capacity: int, occupancy: int, inbound: int, cfg: PlanningConfig) -> str:
    if status in ("Closed", "Inactive"):
        return "Closed"
    load = (occupancy + inbound) / capacity if capacity > 0 else 1.0
    if status == "Full" or load >= cfg.full_threshold:
        return "Full"
    if load >= cfg.near_full_threshold:
        return "Near Full"
    return "Open"
