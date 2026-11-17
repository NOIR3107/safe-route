"""The operation clock, shown as T+<minutes> in the UI.

Live: minutes since the active incident started (wall clock).
Drill: the drill's own clock in the drill database, advanced by the server while the drill runs.
"""

from __future__ import annotations

from app.repositories import Repos

from .context import as_utc, utcnow


def now_minute(repos: Repos) -> int:
    if repos.mode == "drill":
        return repos.ops.get().sim_minute
    disaster = repos.disasters.active()
    if disaster is None:
        return 0
    return max(0, int((utcnow() - as_utc(disaster.start_date)).total_seconds() // 60))
