import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import type { Station } from "./types";

export const H3_RESOLUTION = 8;
export const WALK_RADIUS_KM = 1.5;
const DETOUR_FACTOR = 1.3;
const WALK_KMH = 4.5;
/** Neighbour rings to scan around a station; res-8 cell centres are ~0.9 km apart. */
const GRID_RINGS = 3;

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
export function buildHexes(stations: Station[]): Hex[] {
  const byId = new Map<string, Hex>();
  stations.forEach((s, station) => {
    const origin = latLngToCell(s.lat, s.lon, H3_RESOLUTION);
    for (const id of gridDisk(origin, GRID_RINGS)) {
      const [lat, lon] = cellToLatLng(id);
      const km = haversineKm(lat, lon, s.lat, s.lon);
      if (km > WALK_RADIUS_KM) continue;
      let hex = byId.get(id);
      if (!hex) byId.set(id, (hex = { id, lat, lon, near: [] }));
      hex.near.push({ station, walk: walkMinutes(km) });
    }
  });
  return [...byId.values()];
}

export function stationsNear(
  stations: Station[],
  lat: number,
  lon: number,
): { station: number; walk: number }[] {
  const out: { station: number; walk: number }[] = [];
  stations.forEach((s, station) => {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (km <= WALK_RADIUS_KM) out.push({ station, walk: walkMinutes(km) });
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
): Result {
  const n = stations.length;
  const destStations = stationsNear(stations, destLat, destLon);
  const stationTimes = new Float64Array(n).fill(Infinity);
  const alightAt = new Int32Array(n).fill(-1);
  for (let s = 0; s < n; s++) {
    const row = matrix[s];
    for (const { station: t, walk } of destStations) {
      const ride = row[t];
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
