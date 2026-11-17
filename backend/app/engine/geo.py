"""Small geometry helpers (no external GIS library needed at this scale)."""

from __future__ import annotations

import math

from .model import LatLng

EARTH_RADIUS_KM = 6371.0


def haversine_km(a: LatLng, b: LatLng) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def path_length_km(path: list[LatLng]) -> float:
    return sum(haversine_km(path[i - 1], path[i]) for i in range(1, len(path)))


def point_along(path: list[LatLng], t: float) -> LatLng:
    """Point at fraction t (0..1) of the way along a polyline."""
    if not path:
        return (0.0, 0.0)
    if len(path) == 1 or t <= 0:
        return tuple(path[0])  # type: ignore[return-value]
    if t >= 1:
        return tuple(path[-1])  # type: ignore[return-value]
    target = path_length_km(path) * t
    for i in range(1, len(path)):
        a, b = path[i - 1], path[i]
        seg = haversine_km(a, b)
        if seg > 0 and target <= seg:
            f = target / seg
            return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
        target -= seg
    return tuple(path[-1])  # type: ignore[return-value]


def approach_minutes(frm: LatLng, to: LatLng, speed_kmh: float) -> int:
    return round(haversine_km(frm, to) / speed_kmh * 60)
