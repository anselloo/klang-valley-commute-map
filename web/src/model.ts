import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import type { Station } from "./types";

export const H3_RESOLUTION = 8;
export const WALK_RADIUS_KM = 1.5;
/**
 * Real walks are longer than the straight line. Pedestrian routing on OpenStreetMap (see
 * scripts/calibrate_walking.py) gave a median of 1.8x for random spots 300 m to 1.5 km from a
 * station, 1.5x at the lower quartile, so 1.6 is used. Vehicles detour less.
 */
const DETOUR_FACTOR = 1.6;
const RIDE_DETOUR_FACTOR = 1.3;
const WALK_KMH = 4.5;

/** How people get between a place and a station. */
export interface Access {
  id: "walk" | "bus" | "ride";
  /** Furthest station, in straight-line km. */
  radiusKm: number;
  /** Neighbour rings to scan around a station; res-8 cell centres are ~0.9 km apart. */
  rings: number;
  /** Used in the trip breakdown: "<verb> to <station>". */
  verb: string;
  /** Short wording for messages: "within a 1.5 km walk". */
  reach: string;
}
export const WALK: Access = { id: "walk", radiusKm: WALK_RADIUS_KM, rings: 3, verb: "Walk", reach: "a 1.5 km walk" };
/** Walking, plus feeder buses: a stop within BUS_STOP_KM is a way onto the rail network. */
export const BUS: Access = { id: "bus", radiusKm: WALK_RADIUS_KM, rings: 3, verb: "Walk", reach: "a 1.5 km walk or a feeder bus" };
export const BUS_STOP_KM = 0.5;
/** A feeder bus stop: lat, lon, and the stations it reaches [station, minutes to it, minutes from it, route]. */
export type FeederStop = [number, number, [number, number, number, string][]];
/** Bike, scooter or e-hailing to the station. Short distances are still walked. */
export const RIDE: Access = { id: "ride", radiusKm: 4, rings: 6, verb: "Walk or e-hail", reach: "a 4 km ride" };
const RIDE_KMH = 20; // door to door in city traffic, once the vehicle is found
const RIDE_FIXED_MIN = 4; // finding the vehicle, or parking and locking up

export const BAND_LIMITS = [30, 45, 60] as const;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Straight-line distance x detour factor / walking speed. */
export function walkMinutes(km: number): number {
  return ((km * DETOUR_FACTOR) / WALK_KMH) * 60;
}

/** Minutes to cover `km` in a straight line by the given access mode, or null if out of reach. */
export function accessMinutes(km: number, access: Access = WALK): number | null {
  if (km > access.radiusKm) return null;
  const walk = km <= WALK_RADIUS_KM ? walkMinutes(km) : Infinity;
  if (access.id === "walk") return walk;
  return Math.min(walk, ((km * RIDE_DETOUR_FACTOR) / RIDE_KMH) * 60 + RIDE_FIXED_MIN);
}

/** 0: under 30, 1: 30-45, 2: 45-60, 3: over 60 (or unreachable). */
export function bandOf(minutes: number): number {
  for (let i = 0; i < BAND_LIMITS.length; i++) if (minutes < BAND_LIMITS[i]) return i;
  return BAND_LIMITS.length;
}

export interface Near {
  station: number;
  walk: number;
  back?: number;
  via?: string;
}

export interface Hex {
  id: string;
  lat: number;
  lon: number;
  /** Ways onto the rail network: the station, minutes to reach it, and minutes from it back to here
   *  (when different), plus the bus route when a feeder bus is used. */
  near: Near[];
}

export interface Result {
  /** Minutes from each station to the destination (Infinity if unreachable). */
  stationTimes: Float64Array;
  /** The station near the destination that each station's best trip alights at. */
  alightAt: Int32Array;
  /** Minutes from each hex to the destination (Infinity if unreachable). */
  hexTimes: Float64Array;
  /** The station each hex's best trip starts from. */
  boardAt: Int32Array;
  /** Ways onto the rail network from the destination, with the minutes for the leg the trip uses. */
  destStations: { station: number; walk: number; via?: string }[];
}

/** For two destinations: the longer of the two trips to each hex (Infinity if either cannot be made). */
export function slowest(results: Result[]): Float64Array {
  const n = results[0].hexTimes.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(...results.map((r) => r.hexTimes[i]));
  return out;
}

export type Measure = "worst" | "average";

/**
 * Two destinations as one number per hex. "worst" is the longer trip; "average" is the average trip
 * minutes weighted by how often each trip is made (a weight of 0 ignores that destination, and all
 * weights 0 counts both equally). Infinity if a counted trip cannot be made.
 */
export function combine(results: Result[], measure: Measure, weights: number[] = [1, 1]): Float64Array {
  if (measure === "worst") return slowest(results);
  const w = weights.every((x) => !(x > 0)) ? results.map(() => 1) : results.map((_, i) => Math.max(0, weights[i] ?? 0));
  const total = w.reduce((a, b) => a + b, 0);
  const n = results[0].hexTimes.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < results.length; k++) if (w[k] > 0) sum += w[k] * results[k].hexTimes[i];
    out[i] = sum / total;
  }
  return out;
}

/** The H3 grid of hexes that have at least one station in walking range. */
export function buildHexes(stations: Station[], access: Access = WALK, feeder: FeederStop[] = []): Hex[] {
  const byId = new Map<string, Hex>();
  stations.forEach((s, station) => {
    const origin = latLngToCell(s.lat, s.lon, H3_RESOLUTION);
    for (const id of gridDisk(origin, access.rings)) {
      const [lat, lon] = cellToLatLng(id);
      const km = haversineKm(lat, lon, s.lat, s.lon);
      const walk = accessMinutes(km, access);
      if (walk === null) continue;
      let hex = byId.get(id);
      if (!hex) byId.set(id, (hex = { id, lat, lon, near: [] }));
      hex.near.push({ station, walk });
    }
  });
  if (access.id === "bus") {
    for (const [lat, lon, links] of feeder) {
      for (const id of gridDisk(latLngToCell(lat, lon, H3_RESOLUTION), 2)) {
        const [hlat, hlon] = cellToLatLng(id);
        const km = haversineKm(hlat, hlon, lat, lon);
        if (km > BUS_STOP_KM) continue;
        let hex = byId.get(id);
        if (!hex) byId.set(id, (hex = { id, lat: hlat, lon: hlon, near: [] }));
        const walk = walkMinutes(km);
        for (const [station, to, from, route] of links) {
          hex.near.push({ station, walk: walk + to, back: walk + from, via: route });
        }
      }
    }
  }
  return [...byId.values()];
}

export function stationsNear(
  stations: Station[],
  lat: number,
  lon: number,
  access: Access = WALK,
  feeder: FeederStop[] = [],
): Near[] {
  const out: Near[] = [];
  stations.forEach((s, station) => {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    const walk = accessMinutes(km, access);
    if (walk !== null) out.push({ station, walk });
  });
  if (access.id === "bus") {
    for (const [slat, slon, links] of feeder) {
      const km = haversineKm(lat, lon, slat, slon);
      if (km > BUS_STOP_KM) continue;
      const walk = walkMinutes(km);
      for (const [station, to, from, route] of links) out.push({ station, walk: walk + to, back: walk + from, via: route });
    }
  }
  return out;
}

/**
 * time(S -> D) = min over stations T near D of matrix(S, T) + walk(T, D);
 * time(H -> D) = min over stations S near H of walk(H, S) + time(S -> D).
 */
export function compute(
  stations: Station[],
  matrix: (number | null)[][],
  hexes: Hex[],
  destLat: number,
  destLon: number,
  access: Access = WALK,
  /** True for "coming from the destination": times from it to each place instead of to it. */
  reverse = false,
  feeder: FeederStop[] = [],
): Result {
  const n = stations.length;
  // The destination end: going there, the trip leaves the rail network by the "from" leg; coming
  // back, it starts by the "to" leg.
  const destStations = stationsNear(stations, destLat, destLon, access, feeder).map((d) => ({
    station: d.station,
    walk: reverse ? d.walk : (d.back ?? d.walk),
    via: d.via,
  }));
  const stationTimes = new Float64Array(n).fill(Infinity);
  const alightAt = new Int32Array(n).fill(-1);
  for (let s = 0; s < n; s++) {
    const row = matrix[s];
    for (const { station: t, walk } of destStations) {
      const ride = reverse ? matrix[t][s] : row[t];
      if (ride === null) continue;
      const total = ride + walk;
      if (total < stationTimes[s]) {
        stationTimes[s] = total;
        alightAt[s] = t;
      }
    }
  }
  const hexTimes = new Float64Array(hexes.length).fill(Infinity);
  const boardAt = new Int32Array(hexes.length).fill(-1);
  hexes.forEach((hex, i) => {
    for (const near of hex.near) {
      const { station } = near;
      const total = (reverse ? (near.back ?? near.walk) : near.walk) + stationTimes[station];
      if (total < hexTimes[i]) {
        hexTimes[i] = total;
        boardAt[i] = station;
      }
    }
  });
  return { stationTimes, alightAt, hexTimes, boardAt, destStations };
}
