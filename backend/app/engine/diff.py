"""Household-level diff between two plan versions.

Aggregated per (zone, from shelter, to shelter) so the UI can say "312 people from Saidapet moved
Guindy School -> Loyola College (+6 min) because the bridge flooded".
"""

from __future__ import annotations

from dataclasses import dataclass

from .allocate import js_round
from .cost import round1


@dataclass
class Placement:
    shelter_id: int
    eta: int


def diff_plans(
    prev: dict[str, Placement],
    nxt: dict[str, Placement],
    households: dict[str, tuple[int, int]],  # household_id -> (zone_id, size)
    zone_names: dict[int, str],
    shelter_names: dict[int, str],
    reason: str,
) -> dict:
    buckets: dict[tuple, dict] = {}
    unchanged = newly_unallocated = newly_allocated = 0
    delta_sum = delta_people = 0

    for hid in sorted(set(prev) | set(nxt)):
        if hid not in households:
            continue
        zone_id, size = households[hid]
        a, b = prev.get(hid), nxt.get(hid)
        if a and b and a.shelter_id == b.shelter_id:
            unchanged += size
            continue
        if a and not b:
            newly_unallocated += size
        if b and not a:
            newly_allocated += size
        if a and b:
            delta_sum += (b.eta - a.eta) * size
            delta_people += size
        frm = a.shelter_id if a else None
        to = b.shelter_id if b else None
        key = (zone_id, frm, to)
        bucket = buckets.get(key)
        if bucket is None:
            bucket = buckets[key] = {
                "move": {
                    "zone_id": zone_id,
                    "zone_name": zone_names.get(zone_id, f"Zone {zone_id}"),
                    "from_shelter_id": frm,
                    "from_shelter_name": None if frm is None else shelter_names.get(frm, f"Shelter {frm}"),
                    "to_shelter_id": to,
                    "to_shelter_name": None if to is None else shelter_names.get(to, f"Shelter {to}"),
                    "people": 0,
                    "households": 0,
                    "reason": reason,
                    "eta_before": None,
                    "eta_after": None,
                },
                "eb": 0,
                "ea": 0,
                "wb": 0,
                "wa": 0,
            }
        bucket["move"]["people"] += size
        bucket["move"]["households"] += 1
        if a:
            bucket["eb"] += a.eta * size
            bucket["wb"] += size
        if b:
            bucket["ea"] += b.eta * size
            bucket["wa"] += size

    moves = []
    for b in buckets.values():
        m = dict(b["move"])
        m["eta_before"] = js_round(b["eb"] / b["wb"]) if b["wb"] else None
        m["eta_after"] = js_round(b["ea"] / b["wa"]) if b["wa"] else None
        moves.append(m)
    moves.sort(key=lambda m: -m["people"])

    return {
        "moves": moves,
        "people_moved": sum(m["people"] for m in moves if m["from_shelter_id"] is not None and m["to_shelter_id"] is not None),
        "people_unchanged": unchanged,
        "newly_unallocated": newly_unallocated,
        "newly_allocated": newly_allocated,
        "avg_eta_delta": round1(delta_sum / delta_people) if delta_people else 0,
    }
