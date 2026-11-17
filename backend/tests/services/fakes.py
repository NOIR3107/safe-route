"""In-memory stand-ins for the repositories, so service rules can be tested without a database."""

from __future__ import annotations

from types import SimpleNamespace


class _Store:
    def __init__(self, items=()):
        self.items = list(items)

    def add(self, obj):
        self.items.append(obj)
        return obj


class FakeRepos:
    mode = "drill"  # the clock then reads ops.get().sim_minute instead of the disaster start time

    def __init__(self, shelters=(), routes=(), versions=(), assignments=()):
        self.shelters = SimpleNamespace(get=lambda i: next((s for s in shelters if s.shelter_id == i), None), list=lambda: list(shelters))
        self.routes = SimpleNamespace(get=lambda i: next((r for r in routes if r.route_id == i), None), list=lambda: list(routes))
        self.plans = SimpleNamespace(
            current_version=lambda plan=None: versions[-1] if versions else None,
            assignments_by_ids=lambda ids: [a for a in assignments if a.assignment_id in ids],
        )
        self.audit = _Store()
        self.notifications = _Store()
        self.events = _Store()
        self.ops = SimpleNamespace(get=lambda: SimpleNamespace(sim_minute=12))
        self.disasters = SimpleNamespace(active=lambda: None)
        self.flushed = 0

    def flush(self):
        self.flushed += 1


def fake_shelter(shelter_id=1, status="Active", capacity=100, occupancy=10, name="Test Shelter"):
    return SimpleNamespace(
        shelter_id=shelter_id, status=status, capacity=capacity, current_occupancy=occupancy, name=name, facilities_list=[]
    )


def fake_route(route_id=1, status="Open"):
    return SimpleNamespace(route_id=route_id, status=status, risk_level="Low", label=f"R{route_id} direct")
