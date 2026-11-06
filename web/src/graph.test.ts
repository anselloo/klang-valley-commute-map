import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RouteFinder, type Graph } from "./graph";

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8")) as T;

describe("route finder matches the Python matrix", () => {
  const matrix = read<(number | null)[][]>("matrix.json");
  const finder = new RouteFinder(read<Graph>("graph.json"), matrix.length, false);

  it("reproduces the matrix for a sample of pairs", () => {
    const n = matrix.length;
    let checked = 0;
    for (let s = 0; s < n; s += 7) {
      for (let t = 3; t < n; t += 11) {
        if (s === t) continue;
        const r = finder.route(s, t);
        const expected = matrix[s][t];
        expect(r).not.toBeNull();
        // The matrix is rounded to 0.1 and the graph to 0.01, so allow a little slack.
        expect(Math.abs(r!.total - expected!)).toBeLessThan(0.5);
        const sum = r!.segments.reduce((acc, seg) => acc + seg.minutes, 0);
        expect(Math.abs(sum - r!.total)).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("same station is zero minutes with no segments", () => {
    expect(finder.route(5, 5)).toEqual({ total: 0, segments: [] });
  });
});

describe("bus journeys between stations", () => {
  const matrix = read<(number | null)[][]>("matrix-bus.json");
  const graph = read<Graph>("graph.json");
  const finder = new RouteFinder(graph, matrix.length, true);

  it("are in the graph, and the route finder uses them where the matrix does", () => {
    expect((graph.buses ?? []).length).toBeGreaterThan(100);
    let withBus = 0;
    for (const [a, b] of (graph.buses ?? []).slice(0, 80)) {
      const r = finder.route(a, b);
      expect(r).not.toBeNull();
      expect(Math.abs(r!.total - matrix[a][b]!)).toBeLessThan(0.5);
      if (r!.segments.some((s) => s.kind === "bus")) withBus++;
    }
    expect(withBus).toBeGreaterThan(5);
  });

  it("name the bus routes in the segment", () => {
    const [a, b] = graph.buses![0];
    const seg = finder.route(a, b)!.segments.find((s) => s.kind === "bus");
    if (seg && seg.kind === "bus") expect(seg.routes.length).toBeGreaterThan(0);
  });
});

describe("line run times against published figures", () => {
  const graph = read<Graph>("graph.json");

  /** End-to-end minutes along a line, following ride edges from a line's first stop. */
  function endToEnd(lineName: string): number {
    const li = graph.lines.indexOf(lineName);
    const out = new Map<number, [number, number][]>();
    const hasIn = new Set<number>();
    for (const [a, b, d] of graph.rides) {
      out.set(a, [...(out.get(a) ?? []), [b, d]]);
      hasIn.add(b);
    }
    let best = 0;
    graph.nodes.forEach(([, l], i) => {
      if (l !== li || hasIn.has(i)) return;
      let total = 0;
      for (let cur = i; out.get(cur)?.length; ) {
        const [next, d] = out.get(cur)![0];
        total += d;
        cur = next;
      }
      best = Math.max(best, total);
    });
    return best;
  }

  it("the Putrajaya Line takes about 84 minutes end to end, as Rapid KL says", () => {
    // The timetable has no dwell time at its stops; the build adds it. Without it this is 68.
    const t = endToEnd("PYL");
    expect(t).toBeGreaterThan(80);
    expect(t).toBeLessThan(88);
  });

  it("the Kajang Line takes about 88 minutes end to end", () => {
    const t = endToEnd("KGL");
    expect(t).toBeGreaterThan(84);
    expect(t).toBeLessThan(92);
  });
});
