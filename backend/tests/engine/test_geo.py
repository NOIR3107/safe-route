"""Geometry helpers used for ETAs and vehicle positions (TC-ENG-34 .. TC-ENG-36)."""

from __future__ import annotations

from app.engine.geo import approach_minutes, haversine_km, path_length_km, point_along


def test_eng34_haversine_matches_a_known_distance():
    # Chennai Central to Chennai airport is about 15.6 km in a straight line.
    assert abs(haversine_km((13.0827, 80.2757), (12.9941, 80.1709)) - 14.9) < 1.0


def test_eng35_point_along_walks_the_polyline():
    path = [(13.0, 80.0), (13.0, 80.1), (13.1, 80.1)]
    assert point_along(path, 0) == (13.0, 80.0)
    assert point_along(path, 1) == (13.1, 80.1)
    mid = point_along(path, 0.5)
    assert abs(path_length_km(path) / 2 - (haversine_km(path[0], path[1]) + haversine_km(path[1], mid))) < 0.01
    assert point_along([], 0.5) == (0.0, 0.0)


def test_eng36_approach_minutes_uses_speed():
    assert approach_minutes((13.0, 80.0), (13.0, 80.0), 22) == 0
    assert approach_minutes((13.0, 80.0), (13.1, 80.0), 22) == round(haversine_km((13.0, 80.0), (13.1, 80.0)) / 22 * 60)
