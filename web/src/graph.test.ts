import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RouteFinder, type Graph } from "./graph";

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8")) as T;

describe.each(["0800", "0900"])("route finder matches the Python matrix (%s)", (label) => {
  const matrix = read<(number | null)[][]>(`matrix-${label}.json`);
  const finder = new RouteFinder(read<Graph>(`graph-${label}.json`), matrix.length);

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
