import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ease, formatClock, Network, type NetworkData, type StationPos } from "./network";

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8")) as T;

describe("ease", () => {
  it("starts at 0, ends at 1, is symmetric and monotonic", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 10);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 10);
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      expect(ease(f)).toBeGreaterThanOrEqual(prev);
      prev = ease(f);
    }
  });
});

describe("formatClock", () => {
  it("formats and wraps seconds of the day", () => {
    expect(formatClock(7.5 * 3600)).toBe("07:30");
    expect(formatClock(86400 + 65)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
  });
});

describe("a straight three-station line", () => {
  // A (lon 101.60), B (101.61), C (101.62) on one latitude. Stops A at 0, B at +120 s, C at +300 s.
  const stations: StationPos[] = [101.6, 101.61, 101.62].map((lon) => ({ lat: 3.1, lon }));
  const data: NetworkData = {
    lines: [{ id: "t:1", name: "T", longName: "Test", mode: "LRT", color: "#ff0000", path: [0, 1, 2] }],
    shapes: [],
    patterns: [
      { line: 0, shape: null, stops: [0, 1, 2], arr: [0, 100, 300], dep: [0, 120, 300] },
      { line: 0, shape: null, stops: [2, 1, 0], arr: [0, 100, 300], dep: [0, 120, 300] },
    ],
    trips: [[0, 3600], [1, 3600], [0, 4200]],
  };
  const net = new Network(data, stations);

  it("has no trains before the first trip or after the last", () => {
    expect(net.trainsAt(3599)).toHaveLength(0);
    expect(net.trainsAt(4200 + 301)).toHaveLength(0);
  });

  it("starts stopped at the first station", () => {
    const t = net.trainsAt(3600).filter((x) => x.pattern === 0)[0];
    expect(t.stopped).toBe(true);
    expect(t.lon).toBeCloseTo(101.6, 6);
  });

  it("is halfway between stations at the midpoint of the segment", () => {
    const t = net.trainsAt(3600 + 50).filter((x) => x.pattern === 0)[0];
    expect(t.stopped).toBe(false);
    expect(t.lon).toBeCloseTo(101.605, 5);
    expect(t.nextStop).toBe(1);
    expect(t.secondsToNext).toBeCloseTo(50, 6);
    expect(t.bearing).toBeCloseTo(90, 3); // eastbound
  });

  it("dwells at the middle station, then carries on", () => {
    const dwell = net.trainsAt(3600 + 110).filter((x) => x.pattern === 0)[0];
    expect(dwell.stopped).toBe(true);
    expect(dwell.lon).toBeCloseTo(101.61, 6);
    const after = net.trainsAt(3600 + 210).filter((x) => x.pattern === 0)[0];
    expect(after.stopped).toBe(false);
    expect(after.lon).toBeCloseTo(101.615, 5);
  });

  it("the reverse trip runs westbound at the same time", () => {
    const t = net.trainsAt(3600 + 50).filter((x) => x.pattern === 1)[0];
    expect(t.lon).toBeCloseTo(101.615, 5);
    expect(t.bearing).toBeCloseTo(270, 3); // westbound
    expect(t.destination).toBe(0);
  });

  it("lists the next departures from the middle station, soonest first", () => {
    const deps = net.departures(1, 3600 + 60, 30 * 60);
    // Westbound/eastbound trips of the first pair leave B at +120 s (60 s from now); the 4200 s one is later.
    expect(deps.map((d) => d.inSeconds)).toEqual([60, 60, 660]);
    expect(new Set(deps.map((d) => d.destination))).toEqual(new Set([0, 2]));
  });

  it("does not list departures from the terminus", () => {
    expect(net.departures(2, 3600, 30 * 60).every((d) => d.destination !== 2)).toBe(true);
  });

  it("counts trains per line", () => {
    expect(net.countByLine(3600 + 10)).toEqual([2]);
  });
});

describe("the real network", () => {
  const data = read<NetworkData>("network.json");
  const stations = read<StationPos[]>("stations.json");
  const net = new Network(data, stations);

  it("has trains in the morning peak and none in the small hours", () => {
    const peak = net.trainsAt(7.5 * 3600).length;
    expect(peak).toBeGreaterThan(120);
    expect(peak).toBeLessThan(320);
    expect(net.trainsAt(3 * 3600)).toHaveLength(0);
  });

  it("keeps every train inside the Klang Valley, all day", () => {
    for (let t = 5 * 3600; t < 25 * 3600; t += 1700) {
      for (const tr of net.trainsAt(t % 86400)) {
        expect(tr.lat).toBeGreaterThan(2.78);
        expect(tr.lat).toBeLessThan(3.42);
        expect(tr.lon).toBeGreaterThan(101.33);
        expect(tr.lon).toBeLessThan(101.92);
        expect(Number.isFinite(tr.bearing)).toBe(true);
      }
    }
  });

  it("puts a stopped train close to the station it is stopped at", () => {
    let checked = 0;
    for (let t = 6 * 3600; t < 23 * 3600; t += 997) {
      for (const tr of net.trainsAt(t)) {
        if (!tr.stopped) continue;
        const s = stations[net.patterns[tr.pattern].stops[tr.nextStop]];
        const dLat = (tr.lat - s.lat) * 110574;
        const dLon = (tr.lon - s.lon) * 111320 * Math.cos((3.1 * Math.PI) / 180);
        expect(Math.hypot(dLat, dLon)).toBeLessThan(450);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("every line has geometry to draw", () => {
    data.lines.forEach((_, i) => expect(net.lineCoordinates(i).length).toBeGreaterThan(1));
  });

  it("KL Sentral has frequent departures at 7:30 am, and they wrap past midnight", () => {
    const sentral = stations
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.lat > 3.13 && s.lat < 3.14 && s.lon > 101.68 && s.lon < 101.69)
      .map(({ i }) => i);
    const peak = sentral.flatMap((i) => net.departures(i, 7.5 * 3600, 10 * 60));
    expect(peak.length).toBeGreaterThan(4);
    const late = sentral.flatMap((i) => net.departures(i, 23.9 * 3600, 3 * 3600));
    expect(late.every((d) => d.inSeconds >= 0)).toBe(true);
  });
});
