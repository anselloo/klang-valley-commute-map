/**
 * The animated train network: where every train is at a given time of day, and which trains
 * leave a station next. Pure logic with no map dependency, driven by data/network.json
 * (see scripts/build_network.py).
 */
export type LonLat = [number, number];

export interface NetLine {
  id: string;
  name: string;
  longName: string;
  mode: string;
  color: string;
  /** Index into `shapes` (lines with published track geometry). */
  shape?: number;
  /** Station indices to join with straight lines (lines without geometry). */
  path?: number[];
}

export interface Pattern {
  line: number;
  shape: number | null;
  /** Station indices in travel order. */
  stops: number[];
  /** Metres along the shape at each stop (shaped patterns only). May decrease. */
  d?: number[];
  /** Arrival and departure seconds at each stop, relative to the trip start. */
  arr: number[];
  dep: number[];
}

export interface NetworkData {
  lines: NetLine[];
  shapes: LonLat[][];
  patterns: Pattern[];
  /** [pattern index, start second of day], sorted by start. */
  trips: [number, number][];
}

export interface StationPos {
  lat: number;
  lon: number;
}

export interface Train {
  trip: number;
  line: number;
  pattern: number;
  lon: number;
  lat: number;
  /** Heading in degrees clockwise from north. */
  bearing: number;
  /** True while dwelling at a station. */
  stopped: boolean;
  /** Index into the pattern's stops of the stop the train is at or heading to. */
  nextStop: number;
  /** Seconds until it reaches `nextStop` (0 when stopped there). */
  secondsToNext: number;
  /** Final station of the trip. */
  destination: number;
}

export interface Departure {
  line: number;
  /** Final station of the service. */
  destination: number;
  /** Seconds from now until it leaves. */
  inSeconds: number;
}

export const DAY = 86400;

// Same flat-earth projection the build step uses, so distances line up.
const LAT0 = 3.1;
const LON0 = 101.6;
const M_PER_LAT = 110574;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toXY = (p: LonLat): [number, number] => [(p[0] - LON0) * M_PER_LON, (p[1] - LAT0) * M_PER_LAT];

interface Geometry {
  pts: LonLat[];
  /** Cumulative metres at each vertex. */
  cum: number[];
  /** Metres along the geometry at each stop. */
  stopDist: number[];
}

/** Smooth start and stop between stations. */
export function ease(f: number): number {
  return f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
}

function cumulative(pts: LonLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = toXY(pts[i - 1]);
    const [bx, by] = toXY(pts[i]);
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return cum;
}

export class Network {
  readonly lines: NetLine[];
  readonly patterns: Pattern[];
  readonly trips: [number, number][];
  private readonly geometry: Geometry[];
  private readonly tripEnd: Float64Array;
  /** Per pattern, the trip start times (sorted), for departure look-ups. */
  private readonly startsByPattern: number[][];
  /** Per station, the (pattern, stop index) pairs that call there. */
  private readonly callsAt = new Map<number, [number, number][]>();
  private readonly lineCoords: LonLat[][];

  constructor(
    data: NetworkData,
    stations: StationPos[],
  ) {
    this.lines = data.lines;
    this.patterns = data.patterns;
    this.trips = data.trips;
    const shapeCum = data.shapes.map(cumulative);
    this.geometry = data.patterns.map((p) => {
      if (p.shape !== null && p.d) {
        return { pts: data.shapes[p.shape], cum: shapeCum[p.shape], stopDist: p.d };
      }
      const pts = p.stops.map((s): LonLat => [stations[s].lon, stations[s].lat]);
      const cum = cumulative(pts);
      return { pts, cum, stopDist: cum };
    });
    this.tripEnd = new Float64Array(data.trips.length);
    data.trips.forEach(([pat, start], i) => {
      this.tripEnd[i] = start + data.patterns[pat].arr[data.patterns[pat].arr.length - 1];
    });
    this.startsByPattern = data.patterns.map(() => []);
    for (const [pat, start] of data.trips) this.startsByPattern[pat].push(start);
    data.patterns.forEach((p, pi) => {
      p.stops.forEach((s, j) => {
        if (j === p.stops.length - 1) return; // nobody boards at the terminus
        if (!this.callsAt.has(s)) this.callsAt.set(s, []);
        this.callsAt.get(s)!.push([pi, j]);
      });
    });
    this.lineCoords = data.lines.map((l) => {
      if (l.shape !== undefined) return data.shapes[l.shape];
      return (l.path ?? []).map((s): LonLat => [stations[s].lon, stations[s].lat]);
    });
  }

  /** The polyline to draw for a line. */
  lineCoordinates(line: number): LonLat[] {
    return this.lineCoords[line];
  }

  /** Every train that is running at second-of-day `t` (0 to 86400). */
  trainsAt(t: number): Train[] {
    const out: Train[] = [];
    for (let i = 0; i < this.trips.length; i++) {
      const start = this.trips[i][1];
      if (start > t + DAY) break;
      for (const time of [t, t + DAY]) {
        if (start <= time && time <= this.tripEnd[i]) {
          const train = this.trainOf(i, time - start);
          if (train) out.push(train);
          break;
        }
      }
    }
    return out;
  }

  private trainOf(trip: number, rel: number): Train | null {
    const pi = this.trips[trip][0];
    const p = this.patterns[pi];
    const g = this.geometry[pi];
    const n = p.stops.length;
    // Last stop the train has already reached (arrival not after `rel`).
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (p.arr[mid] <= rel) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    const destination = p.stops[n - 1];
    if (rel <= p.dep[i] || i === n - 1) {
      // Dwelling at stop i (or arriving at the terminus). Face the direction of travel.
      const sign = i < n - 1 ? g.stopDist[i + 1] - g.stopDist[i] : g.stopDist[i] - (g.stopDist[i - 1] ?? g.stopDist[i]);
      const [lon, lat, bearing] = this.pointAt(g, g.stopDist[i], sign);
      return { trip, line: p.line, pattern: pi, lon, lat, bearing, stopped: true, nextStop: i, secondsToNext: 0, destination };
    }
    const span = p.arr[i + 1] - p.dep[i];
    const f = span > 0 ? (rel - p.dep[i]) / span : 1;
    const delta = g.stopDist[i + 1] - g.stopDist[i];
    const [lon, lat, bearing] = this.pointAt(g, g.stopDist[i] + delta * ease(Math.min(1, Math.max(0, f))), delta);
    return {
      trip, line: p.line, pattern: pi, lon, lat, bearing, stopped: false,
      nextStop: i + 1, secondsToNext: p.arr[i + 1] - rel, destination,
    };
  }

  /** The point `dist` metres along the geometry, with a bearing that follows the sign of `direction`. */
  private pointAt(g: Geometry, dist: number, direction: number): [number, number, number] {
    const { pts, cum } = g;
    const d = Math.min(cum[cum.length - 1], Math.max(0, dist));
    let lo = 0;
    let hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = pts[lo];
    const b = pts[lo + 1] ?? a;
    const len = cum[lo + 1] - cum[lo];
    const t = len > 0 ? (d - cum[lo]) / len : 0;
    const lon = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    let bearing = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
    if (direction < 0) bearing += 180; // travelling against the geometry's direction
    return [lon, lat, (bearing + 360) % 360];
  }

  /**
   * The next departures from a station after second-of-day `t`: for each line and destination,
   * the soonest `perService` trains within `withinSeconds`, soonest first.
   */
  departures(station: number, t: number, withinSeconds = 30 * 60, perService = 2): Departure[] {
    const found = new Map<string, Departure[]>();
    for (const [pi, j] of this.callsAt.get(station) ?? []) {
      const p = this.patterns[pi];
      const offset = p.dep[j];
      const starts = this.startsByPattern[pi];
      // Today's trips, tomorrow's early trips (shifted back a day) and yesterday's overnight ones.
      for (const base of [t, t - DAY, t + DAY]) {
        // First trip whose departure from this stop is at or after `base`.
        let lo = 0;
        let hi = starts.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (starts[mid] + offset < base) lo = mid + 1;
          else hi = mid;
        }
        for (let k = lo; k < starts.length && k < lo + perService; k++) {
          const inSeconds = starts[k] + offset - base;
          if (inSeconds > withinSeconds) break;
          const destination = p.stops[p.stops.length - 1];
          const key = `${p.line}:${destination}`;
          if (!found.has(key)) found.set(key, []);
          found.get(key)!.push({ line: p.line, destination, inSeconds });
        }
      }
    }
    const merged: Departure[] = [];
    for (const list of found.values()) {
      list.sort((a, b) => a.inSeconds - b.inSeconds);
      merged.push(...list.slice(0, perService));
    }
    return merged.sort((a, b) => a.inSeconds - b.inSeconds);
  }

  /** How many trains of each line are running at `t`. */
  countByLine(t: number): number[] {
    const counts = this.lines.map(() => 0);
    for (const train of this.trainsAt(t)) counts[train.line]++;
    return counts;
  }
}

export function formatClock(t: number): string {
  const s = ((Math.floor(t) % DAY) + DAY) % DAY;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
