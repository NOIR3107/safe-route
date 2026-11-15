/**
 * Generic min-cost max-flow via successive shortest paths (Bellman-Ford/SPFA on the residual graph).
 * Graphs here are small (tens of demand groups × a handful of shelters), so SPFA is plenty fast and
 * handles the negative residual costs without potentials.
 */
interface Edge {
  to: number;
  rev: number;
  cap: number;
  cost: number;
  /** index into the user-visible edge list, -1 for residual edges */
  id: number;
}

export class MinCostFlow {
  private readonly graph: Edge[][];
  private readonly edgeRefs: { from: number; index: number; original: number }[] = [];

  constructor(private readonly n: number) {
    this.graph = Array.from({ length: n }, () => []);
  }

  /** Adds a directed edge and returns its id (used to read back the flow). */
  addEdge(from: number, to: number, cap: number, cost: number): number {
    const id = this.edgeRefs.length;
    this.graph[from]!.push({ to, rev: this.graph[to]!.length, cap, cost, id });
    this.graph[to]!.push({ to: from, rev: this.graph[from]!.length - 1, cap: 0, cost: -cost, id: -1 });
    this.edgeRefs.push({ from, index: this.graph[from]!.length - 1, original: cap });
    return id;
  }

  flowOn(id: number): number {
    const ref = this.edgeRefs[id]!;
    return ref.original - this.graph[ref.from]![ref.index]!.cap;
  }

  solve(source: number, sink: number, maxFlow = Number.POSITIVE_INFINITY): { flow: number; cost: number } {
    let flow = 0;
    let cost = 0;
    const EPS = 1e-9;
    while (flow < maxFlow) {
      const dist = new Array<number>(this.n).fill(Number.POSITIVE_INFINITY);
      const inQueue = new Array<boolean>(this.n).fill(false);
      const prevNode = new Array<number>(this.n).fill(-1);
      const prevEdge = new Array<number>(this.n).fill(-1);
      dist[source] = 0;
      const queue: number[] = [source];
      inQueue[source] = true;
      while (queue.length > 0) {
        const u = queue.shift()!;
        inQueue[u] = false;
        const edges = this.graph[u]!;
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i]!;
          if (e.cap > 0 && dist[u]! + e.cost < dist[e.to]! - EPS) {
            dist[e.to] = dist[u]! + e.cost;
            prevNode[e.to] = u;
            prevEdge[e.to] = i;
            if (!inQueue[e.to]) {
              queue.push(e.to);
              inQueue[e.to] = true;
            }
          }
        }
      }
      if (dist[sink] === Number.POSITIVE_INFINITY) break;

      let push = maxFlow - flow;
      for (let v = sink; v !== source; v = prevNode[v]!) {
        push = Math.min(push, this.graph[prevNode[v]!]![prevEdge[v]!]!.cap);
      }
      for (let v = sink; v !== source; v = prevNode[v]!) {
        const e = this.graph[prevNode[v]!]![prevEdge[v]!]!;
        e.cap -= push;
        this.graph[v]![e.rev]!.cap += push;
      }
      flow += push;
      cost += push * dist[sink]!;
    }
    return { flow, cost };
  }
}
