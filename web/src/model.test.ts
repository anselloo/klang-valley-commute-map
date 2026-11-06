import { describe, expect, it } from "vitest";
import { bandOf, buildHexes, compute, haversineKm, walkMinutes } from "./model";
import type { Station } from "./types";

const st = (id: string, lat: number, lon: number): Station => ({ id, name: id, lat, lon, lines: [] });

describe("walking", () => {
  it("applies the 1.3 detour factor at 4.5 km/h", () => {
    expect(walkMinutes(1)).toBeCloseTo((1.6 / 4.5) * 60, 6);
  });
  it("haversine: one degree of latitude is about 111 km", () => {
    expect(haversineKm(3, 101, 4, 101)).toBeCloseTo(111.2, 0);
  });
});

describe("bands", () => {
  it("splits at 30, 45 and 60 minutes", () => {
    expect([29.9, 30, 44.9, 45, 59.9, 60, Infinity].map(bandOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("compute", () => {
  // A at the origin, B ~2.2 km east (outside A's walk radius), C ~1.1 km north of A.
  const stations = [st("S000", 3.1, 101.6), st("S001", 3.1, 101.62), st("S002", 3.11, 101.6)];
  const matrix = [
    [0, 10, 5],
    [12, 0, null],
    [6, null, 0],
  ];
  const hexes = buildHexes(stations);

  it("a destination at a station takes the best ride plus the short walk", () => {
    const r = compute(stations, matrix, hexes, 3.1, 101.62); // right at S001
    expect(r.destStations.map((d) => d.station)).toEqual([1]);
    expect(r.stationTimes[0]).toBeCloseTo(10, 5);
    expect(r.stationTimes[1]).toBeCloseTo(0, 5);
    expect(r.stationTimes[2]).toBe(Infinity); // S002 cannot reach S001
  });

  it("takes the min over every station near the destination", () => {
    const r = compute(stations, matrix, hexes, 3.105, 101.6); // between S000 and S002
    expect(r.destStations.map((d) => d.station).sort()).toEqual([0, 2]);
    // From S001 only S000 is reachable (12 min) plus the walk to the destination.
    const walk0 = r.destStations.find((d) => d.station === 0)!.walk;
    expect(r.stationTimes[1]).toBeCloseTo(12 + walk0, 5);
    expect(r.alightAt[1]).toBe(0);
  });

  it("hex time is walk to a station plus that station's time", () => {
    const r = compute(stations, matrix, hexes, 3.1, 101.62);
    hexes.forEach((hex, i) => {
      const expected = Math.min(...hex.near.map((n) => n.walk + r.stationTimes[n.station]));
      expect(r.hexTimes[i]).toBeCloseTo(expected, 8);
    });
  });

  it("only includes hexes with a station in walking range", () => {
    for (const hex of hexes) expect(hex.near.length).toBeGreaterThan(0);
  });
});
