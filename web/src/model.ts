import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import type { Station } from "./types";

export const H3_RESOLUTION = 8;
export const WALK_RADIUS_KM = 1.5;
const DETOUR_FACTOR = 1.3;
const WALK_KMH = 4.5;

/** How people get between a place and a station. */
export interface Access {
  id: "walk" | "ride";
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
  return Math.min(walk, ((km * DETOUR_FACTOR) / RIDE_KMH) * 60 + RIDE_FIXED_MIN);
}

/** 0: under 30, 1: 30-45, 2: 45-60, 3: over 60 (or unreachable). */
export function bandOf(minutes: number): number {
  for (let i = 0; i < BAND_LIMITS.length; i++) if (minutes < BAND_LIMITS[i]) return i;
  return BAND_LIMITS.length;
}

export interface Hex {
  id: string;
  lat: number;
  lon: number;
  /** Stations within walking range: index and walking minutes. */
  near: { station: number; walk: number }[];
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
  /** Stations within walking range of the destination. */
  destStations: { station: number; walk: number }[];
}

/** The H3 grid of hexes that have at least one station in walking range. */
export function buildHexes(stations: Station[], access: Access = WALK): Hex[] {
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
  return [...byId.values()];
}

export function stationsNear(
  stations: Station[],
  lat: number,
  lon: number,
  access: Access = WALK,
): { station: number; walk: number }[] {
  const out: { station: number; walk: number }[] = [];
  stations.forEach((s, station) => {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    const walk = accessMinutes(km, access);
    if (walk !== null) out.push({ station, walk });
  });
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
): Result {
  const n = stations.length;
  const destStations = stationsNear(stations, destLat, destLon, access);
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
    for (const { station, walk } of hex.near) {
      const total = walk + stationTimes[station];
      if (total < hexTimes[i]) {
        hexTimes[i] = total;
        boardAt[i] = station;
      }
    }
  });
  return { stationTimes, alightAt, hexTimes, boardAt, destStations };
}
