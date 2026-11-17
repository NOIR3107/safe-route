"""SEED DATA for local development, tests and drills. Clearly not live data."""

from .loader import DEMO_PASSWORDS, DEMO_USERS, clear_all, load_scenario, resolve_events
from .scenarios import CHENNAI_FLOOD, SCENARIOS, scenario_by_id, synthetic_scenario

__all__ = [
    "CHENNAI_FLOOD",
    "DEMO_PASSWORDS",
    "DEMO_USERS",
    "SCENARIOS",
    "clear_all",
    "load_scenario",
    "resolve_events",
    "scenario_by_id",
    "synthetic_scenario",
]
