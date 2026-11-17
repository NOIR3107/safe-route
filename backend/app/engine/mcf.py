"""Min-cost max-flow by successive shortest paths (SPFA / Bellman-Ford on the residual graph).

The graphs are small (tens of demand groups by a handful of shelters), so SPFA is fast enough and
copes with the negative costs of residual edges without potentials.
"""

from __future__ import annotations

from collections import deque

INF = float("inf")


class MinCostFlow:
    def __init__(self, n: int) -> None:
        self.n = n
        # graph[u] = list of [to, rev_index, capacity, cost]
        self.graph: list[list[list]] = [[] for _ in range(n)]
        self.edge_refs: list[tuple[int, int, float]] = []  # (from, index, original capacity)

    def add_edge(self, frm: int, to: int, cap: float, cost: float) -> int:
        """Adds a directed edge and returns its id (to read the flow back)."""
        self.graph[frm].append([to, len(self.graph[to]), cap, cost])
        self.graph[to].append([frm, len(self.graph[frm]) - 1, 0, -cost])
        self.edge_refs.append((frm, len(self.graph[frm]) - 1, cap))
        return len(self.edge_refs) - 1

    def flow_on(self, edge_id: int) -> float:
        frm, idx, original = self.edge_refs[edge_id]
        return original - self.graph[frm][idx][2]

    def solve(self, source: int, sink: int) -> tuple[float, float]:
        flow = cost = 0.0
        eps = 1e-9
        while True:
            dist = [INF] * self.n
            in_queue = [False] * self.n
            prev_node = [-1] * self.n
            prev_edge = [-1] * self.n
            dist[source] = 0
            queue = deque([source])
            in_queue[source] = True
            while queue:
                u = queue.popleft()
                in_queue[u] = False
                for i, (to, _rev, cap, c) in enumerate(self.graph[u]):
                    if cap > 0 and dist[u] + c < dist[to] - eps:
                        dist[to] = dist[u] + c
                        prev_node[to], prev_edge[to] = u, i
                        if not in_queue[to]:
                            queue.append(to)
                            in_queue[to] = True
            if dist[sink] == INF:
                return flow, cost
            push = INF
            v = sink
            while v != source:
                push = min(push, self.graph[prev_node[v]][prev_edge[v]][2])
                v = prev_node[v]
            v = sink
            while v != source:
                e = self.graph[prev_node[v]][prev_edge[v]]
                e[2] -= push
                self.graph[v][e[1]][2] += push
                v = prev_node[v]
            flow += push
            cost += push * dist[sink]
