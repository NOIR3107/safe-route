"""Deterministic random numbers (mulberry32): the same seed always builds the same households."""

from __future__ import annotations

MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & MASK


class Prng:
    def __init__(self, seed: int) -> None:
        self.state = seed & MASK

    def next(self) -> float:
        self.state = (self.state + 0x6D2B79F5) & MASK
        t = self.state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    def int(self, lo: int, hi_inclusive: int) -> int:
        return lo + int(self.next() * (hi_inclusive - lo + 1))

    def chance(self, p: float) -> bool:
        return self.next() < p

    def pick(self, items):
        return items[int(self.next() * len(items))]

    def weighted(self, buckets):
        """buckets = [(value, weight), ...]"""
        total = sum(w for _, w in buckets)
        r = self.next() * total
        for value, w in buckets:
            r -= w
            if r <= 0:
                return value
        return buckets[-1][0]
