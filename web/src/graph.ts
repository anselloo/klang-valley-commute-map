/**
 * Rebuilds the route for one station-to-station trip from the exported line graph.
 * Mirrors the Dijkstra in scripts/build_matrix.py so totals match the matrix.
 *
 * States: ("T", station) arrived by train, ("W", station) arrived on foot, and one
 * state per line node (a stop on a line in one direction).
 */
export interface Graph {
  penalty: number;
  lines: string[];
  /** [station, line index, headway in minutes (0 = cannot board here)] */
  nodes: [number, number, number][];
  /** [from node, to node, minutes] */
  rides: [number, number, number][];
  /** [station a, station b, minutes], undirected */
  walks: [number, number, number][];
  /** Bus journeys between stations, one way: [from, to, minutes, routes]; routes are joined with " > " for a change. */
  buses?: [number, number, number, string][];
}

export type Segment =
  | { kind: "wait"; line: string; station: number; minutes: number }
  | { kind: "ride"; line: string; from: number; to: number; stops: number; minutes: number }
  | { kind: "transfer"; station: number; to: number; minutes: number; onFoot: boolean }
  | { kind: "bus"; routes: string; from: number; to: number; minutes: number };

export interface Route {
  total: number;
  segments: Segment[];
}

interface Edge {
  to: number;
  cost: number;
  routes?: string;
}

class MinHeap {
  private items: [number, number][] = [];

  get size() {
    return this.items.length;
  }

  push(cost: number, state: number) {
    const a = this.items;
    a.push([cost, state]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class RouteFinder {
  private readonly n: number;
  private readonly boardEdges: Edge[][];
  private readonly rideEdges: Edge[][];
  private readonly walkEdges: Edge[][];
  private readonly busEdges: Edge[][];
  private readonly stateCount: number;

  constructor(
    private readonly graph: Graph,
    stationCount: number,
    /** Use the bus links between stations. Off for the rail-only matrices. */
    useBuses = true,
  ) {
    this.n = stationCount;
    this.stateCount = 2 * stationCount + graph.nodes.length;
    this.boardEdges = Array.from({ length: stationCount }, () => []);
    this.walkEdges = Array.from({ length: stationCount }, () => []);
    this.busEdges = Array.from({ length: stationCount }, () => []);
    this.rideEdges = Array.from({ length: graph.nodes.length }, () => []);
    graph.nodes.forEach(([station, , headway], i) => {
      if (headway > 0) this.boardEdges[station].push({ to: i, cost: headway / 2 });
    });
    for (const [a, b, dur] of graph.rides) this.rideEdges[a].push({ to: b, cost: dur });
    for (const [a, b, w] of graph.walks) {
      this.walkEdges[a].push({ to: b, cost: w });
      this.walkEdges[b].push({ to: a, cost: w });
    }
    if (useBuses) for (const [a, b, m, routes] of graph.buses ?? []) this.busEdges[a].push({ to: b, cost: m, routes });
  }

  private trainState(station: number) {
    return station;
  }
  private footState(station: number) {
    return this.n + station;
  }
  private lineState(node: number) {
    return 2 * this.n + node;
  }

  route(src: number, dst: number): Route | null {
    if (src === dst) return { total: 0, segments: [] };
    const { n, graph } = this;
    const dist = new Float64Array(this.stateCount).fill(Infinity);
    const parent = new Int32Array(this.stateCount).fill(-1);
    const heap = new MinHeap();
    const relax = (state: number, cost: number, from: number) => {
      if (cost < dist[state]) {
        dist[state] = cost;
        parent[state] = from;
        heap.push(cost, state);
      }
    };
    relax(this.footState(src), 0, -1);
    for (const e of this.walkEdges[src]) relax(this.footState(e.to), e.cost, this.footState(src));
    for (const e of this.busEdges[src]) relax(this.footState(e.to), e.cost, this.footState(src));

    const done = new Uint8Array(this.stateCount);
    while (heap.size) {
      const [d, state] = heap.pop();
      if (done[state]) continue;
      done[state] = 1;
      if (state < 2 * n) {
        const onTrain = state < n;
        const st = onTrain ? state : state - n;
        const extra = onTrain ? graph.penalty : 0;
        for (const e of this.boardEdges[st]) relax(this.lineState(e.to), d + e.cost + extra, state);
        if (onTrain) {
          for (const e of this.walkEdges[st]) relax(this.footState(e.to), d + e.cost, state);
          for (const e of this.busEdges[st]) relax(this.footState(e.to), d + e.cost, state);
        }
      } else {
        const node = state - 2 * n;
        for (const e of this.rideEdges[node]) relax(this.lineState(e.to), d + e.cost, state);
        relax(this.trainState(graph.nodes[node][0]), d, state);
      }
    }

    const endState =
      dist[this.trainState(dst)] <= dist[this.footState(dst)] ? this.trainState(dst) : this.footState(dst);
    if (!Number.isFinite(dist[endState])) return null;

    const states: number[] = [];
    for (let s = endState; s !== -1; s = parent[s]) states.push(s);
    states.reverse();
    return { total: dist[endState], segments: this.segmentsOf(states, dist) };
  }

  private segmentsOf(states: number[], dist: Float64Array): Segment[] {
    const { n, graph } = this;
    const out: Segment[] = [];
    const stationOf = (s: number) => (s < n ? s : s < 2 * n ? s - n : graph.nodes[s - 2 * n][0]);
    let ride: Extract<Segment, { kind: "ride" }> | null = null;
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1];
      const cur = states[i];
      const cost = dist[cur] - dist[prev];
      const prevIsLine = prev >= 2 * n;
      const curIsLine = cur >= 2 * n;
      if (!prevIsLine && curIsLine) {
        // Boarding: headway/2 wait, plus the transfer penalty if we arrived by train.
        const [station, lineIdx, headway] = graph.nodes[cur - 2 * n];
        if (prev < n) {
          out.push({ kind: "transfer", station, to: station, minutes: graph.penalty, onFoot: false });
        }
        out.push({ kind: "wait", line: graph.lines[lineIdx], station, minutes: headway / 2 });
        ride = { kind: "ride", line: graph.lines[lineIdx], from: station, to: station, stops: 0, minutes: 0 };
        out.push(ride);
      } else if (prevIsLine && curIsLine) {
        ride!.stops += 1;
        ride!.minutes += cost;
        ride!.to = stationOf(cur);
      } else if (prevIsLine && !curIsLine) {
        ride = null; // alighting is free
      } else {
        // Between stations on foot, or by bus (train state to foot state, or at the start).
        const from = stationOf(prev);
        const to = stationOf(cur);
        const near = (e: Edge) => e.to === to && Math.abs(e.cost - cost) < 1e-6;
        const bus = this.busEdges[from].find(near);
        if (bus && !this.walkEdges[from].some(near)) {
          out.push({ kind: "bus", routes: bus.routes ?? "", from, to, minutes: cost });
        } else {
          out.push({ kind: "transfer", station: from, to, minutes: cost, onFoot: true });
        }
      }
    }
    return out;
  }
}
