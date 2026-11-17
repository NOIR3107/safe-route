"""Allocation engine: pure Python, no database and no HTTP (Experiment 4, "Decision / Planning")."""

from .allocate import STRATEGIES, STRATEGY_NAMES, AllocationResult, PlannedAssignment, allocate, compare_strategies
from .config import PlanningConfig, load_planning_config
from .diff import Placement, diff_plans
from .model import (
    FACILITIES,
    EngineHousehold,
    EngineInput,
    EngineRoute,
    EngineShelter,
    EngineVehicle,
    EngineZone,
)
from .replan import MOVABLE, ActiveAssignment, Displacement, ReplanEvent, select_affected
from .status import shelter_display_status

__all__ = [
    "STRATEGIES",
    "STRATEGY_NAMES",
    "FACILITIES",
    "MOVABLE",
    "ActiveAssignment",
    "AllocationResult",
    "Displacement",
    "EngineHousehold",
    "EngineInput",
    "EngineRoute",
    "EngineShelter",
    "EngineVehicle",
    "EngineZone",
    "Placement",
    "PlannedAssignment",
    "PlanningConfig",
    "ReplanEvent",
    "allocate",
    "compare_strategies",
    "diff_plans",
    "load_planning_config",
    "select_affected",
    "shelter_display_status",
]
