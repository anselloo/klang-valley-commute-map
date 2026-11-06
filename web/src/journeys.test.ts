import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { haversineKm, RIDE, WALK, accessMinutes, buildHexes, compute } from "./model";
import type { Station } from "./types";

const read = <T>(name: string) =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8")) as T;
const stations = read<Station[]>("stations.json");
const matrix = read<(number | null)[][]>("matrix.json");

const idsOf = (name: string) => stations.flatMap((s, i) => (s.name === name ? [i] : []));
/** Best time between any stations with these names (interchanges can be several clusters). */
function minutes(from: string, to: string): number {
  const a = idsOf(from);
  const b = idsOf(to);
  expect(a.length, `station ${from}`).toBeGreaterThan(0);
  expect(b.length, `station ${to}`).toBeGreaterThan(0);
  return Math.min(...a.flatMap((i) => b.map((j) => matrix[i][j] ?? Infinity)));
}

// Plausibility ranges from what these trips are known to be like on a weekday morning (about +/-30%).
// They are guard rails against a broken build, not ground truth: see docs/VERIFY.md for the real
// spot-check against Google Maps.
const JOURNEYS: [string, string, number, number][] = [
  ["KL Sentral", "KLCC", 10, 25],
  ["Titiwangsa", "Bukit Bintang", 10, 25],
  ["Subang Jaya", "KL Sentral", 28, 50],
  ["Gombak", "KL Sentral", 30, 55],
  ["Kajang", "KL Sentral", 40, 70],
  ["Sungai Buloh", "Bukit Bintang", 35, 60],
  ["Ampang", "KLCC", 25, 45],
];

describe("known journeys", () => {
  for (const [from, to, lo, hi] of JOURNEYS) {
    it(`${from} to ${to} takes ${lo}-${hi} minutes`, () => {
      const t = minutes(from, to);
      expect(t).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    });
  }
});

describe("the whole matrix", () => {
  it("never implies an impossible speed", () => {
    let checked = 0;
    for (let i = 0; i < stations.length; i += 3) {
      for (let j = 0; j < stations.length; j += 3) {
        const t = matrix[i][j];
        if (i === j || t === null) continue;
        const km = haversineKm(stations[i].lat, stations[i].lon, stations[j].lat, stations[j].lon);
        if (km < 3) continue;
        checked++;
        const kmh = km / (t / 60);
        expect(kmh, `${stations[i].name} -> ${stations[j].name}`).toBeLessThan(80);
        // Two stations that share a line should never be slower than walking. (Stations on
        // different networks can be neighbours with no train link, e.g. Klang's KTM and BRT stops.)
        if (stations[i].lines.some((l) => stations[j].lines.includes(l))) {
          expect(kmh, `${stations[i].name} -> ${stations[j].name}`).toBeGreaterThan(5);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("is roughly symmetric", () => {
    let worst = 0;
    for (let i = 0; i < stations.length; i += 4) {
      for (let j = i + 1; j < stations.length; j += 4) {
        const a = matrix[i][j];
        const b = matrix[j][i];
        if (a === null || b === null || Math.min(a, b) < 10) continue;
        worst = Math.max(worst, Math.abs(a - b) / Math.min(a, b));
      }
    }
    // Waits depend on direction (KTM in particular), but a 2x gap would mean a broken build.
    expect(worst).toBeLessThan(1);
  });
});

describe("access modes", () => {
  it("walks 1 km in about 17 minutes and never beyond 1.5 km", () => {
    expect(accessMinutes(1, WALK)).toBeCloseTo(17.3, 0);
    expect(accessMinutes(1.6, WALK)).toBeNull();
  });
  it("riding is never slower than walking, and reaches 4 km", () => {
    for (const km of [0.2, 0.8, 1.5]) expect(accessMinutes(km, RIDE)!).toBeLessThanOrEqual(accessMinutes(km, WALK)!);
    expect(accessMinutes(3.9, RIDE)).toBeGreaterThan(10);
    expect(accessMinutes(4.1, RIDE)).toBeNull();
  });
  it("reaches many more places by bike or e-hail, and never fewer", () => {
    const walkHexes = buildHexes(stations, WALK);
    const rideHexes = buildHexes(stations, RIDE);
    expect(rideHexes.length).toBeGreaterThan(walkHexes.length * 1.5);
    const ids = new Set(rideHexes.map((h) => h.id));
    for (const h of walkHexes) expect(ids.has(h.id)).toBe(true);

    const s = stations.find((x) => x.name === "KL Sentral")!;
    const walk = compute(stations, matrix, walkHexes, s.lat, s.lon, WALK);
    const ride = compute(stations, matrix, rideHexes, s.lat, s.lon, RIDE);
    const reach = (r: typeof walk) => [...r.hexTimes].filter((t) => t < 60).length;
    expect(reach(ride)).toBeGreaterThan(reach(walk));
  });
});

describe("time of day and direction", () => {
  const read2 = (name: string) => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8")) as (number | null)[][];
  const pm = read2("matrix-pm.json");
  const sat = read2("matrix-sat.json");

  it("has a matrix for every time of day, sized like the stations", () => {
    for (const m of [pm, sat]) {
      expect(m.length).toBe(stations.length);
      expect(m.every((r) => r.length === stations.length)).toBe(true);
    }
  });

  it("evening and Saturday times stay close to the morning ones on a single line", () => {
    const i = idsOf("KL Sentral")[0];
    const j = idsOf("KLCC")[0];
    for (const m of [pm, sat]) {
      expect(m[i][j]!).toBeGreaterThan(8);
      expect(m[i][j]!).toBeLessThan(35);
    }
  });

  it("'coming back' reads the matrix the other way round", () => {
    const hexes = buildHexes(stations, WALK);
    const s = stations.find((x) => x.name === "Kajang")!;
    const to = compute(stations, matrix, hexes, s.lat, s.lon, WALK, false);
    const from = compute(stations, matrix, hexes, s.lat, s.lon, WALK, true);
    // They answer different questions, so at least some stations differ, but both see the whole network.
    let differ = 0;
    to.stationTimes.forEach((t, k) => {
      expect(Number.isFinite(t)).toBe(true);
      expect(Number.isFinite(from.stationTimes[k])).toBe(true);
      if (Math.abs(t - from.stationTimes[k]) > 1) differ++;
    });
    expect(differ).toBeGreaterThan(0);
    const t = idsOf("KL Sentral")[0];
    const k = idsOf("Kajang")[0];
    expect(from.stationTimes[t] - (matrix[k][t] ?? 0)).toBeGreaterThanOrEqual(0);
  });
});
