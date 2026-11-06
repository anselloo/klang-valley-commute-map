import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { cellToBoundary } from "h3-js";
import "./style.css";
import { breakdownHtml, escapeHtml } from "./breakdown";
import { RouteFinder, type Graph } from "./graph";
import { bandOf, buildHexes, compute, type Hex, type Result } from "./model";
import type { Station } from "./types";

// Bundlers do not copy MapLibre's worker next to the main bundle, so serve it explicitly.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const KL_CENTER: [number, number] = [101.6869, 3.139];
const BAND_COLORS = ["#0b5394", "#3d8fd1", "#9cc9ec", "#d4d4d4"];
const BAND_LABELS = ["Under 30 min", "30–45 min", "45–60 min", "Over 60 min"];

type Matrix = (number | null)[][];
type WindowId = "0800" | "0900";

async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = el("status");
const hintEl = el("hint");

el("legend").innerHTML = BAND_LABELS.map(
  (label, i) =>
    `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label}${i === 3 ? " or no station nearby" : ""}</li>`,
).join("");

const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: KL_CENTER,
  zoom: 10.3,
  maxBounds: [[100.9, 2.5], [102.4, 3.8]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

const stationsPromise = loadJson<Station[]>("stations.json");
const mapLoaded = new Promise<void>((resolve) => map.on("load", () => resolve()));

// Each arrival-time option has its own matrix (loaded up front for 8:00, on demand for 9:00)
// and route graph (loaded the first time a breakdown is requested).
const matrixCache = new Map<WindowId, Promise<Matrix>>();
const finderCache = new Map<WindowId, Promise<RouteFinder>>();
const getMatrix = (w: WindowId) => {
  if (!matrixCache.has(w)) matrixCache.set(w, loadJson<Matrix>(`matrix-${w}.json`));
  return matrixCache.get(w)!;
};
const getFinder = (w: WindowId, stationCount: number) => {
  if (!finderCache.has(w)) {
    finderCache.set(w, loadJson<Graph>(`graph-${w}.json`).then((g) => new RouteFinder(g, stationCount)));
  }
  return finderCache.get(w)!;
};
getMatrix("0800");

function hexFeatures(hexes: Hex[]) {
  return {
    type: "FeatureCollection" as const,
    features: hexes.map((h) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [cellToBoundary(h.id, true)] },
      properties: { id: h.id },
    })),
  };
}

async function start() {
  const [stations] = await Promise.all([stationsPromise, mapLoaded]);
  const hexes = buildHexes(stations);
  const hexIndex = new Map(hexes.map((h, i) => [h.id, i]));

  map.addSource("hexes", { type: "geojson", data: hexFeatures(hexes), promoteId: "id" });
  map.addLayer({
    id: "hex-fill",
    type: "fill",
    source: "hexes",
    paint: {
      "fill-color": [
        "match", ["feature-state", "band"],
        0, BAND_COLORS[0], 1, BAND_COLORS[1], 2, BAND_COLORS[2], 3, BAND_COLORS[3],
        "rgba(0,0,0,0)",
      ],
      "fill-opacity": ["match", ["feature-state", "band"], 3, 0.35, 0.6],
    },
  });
  map.addSource("stations", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { name: s.name, lines: s.lines.join(", ") },
      })),
    },
  });
  map.addLayer({
    id: "station-dots",
    type: "circle",
    source: "stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 5],
      "circle-color": "#ffffff",
      "circle-stroke-color": "#1d3557",
      "circle-stroke-width": 1.3,
    },
  });
  map.addLayer({
    id: "station-labels",
    type: "symbol",
    source: "stations",
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1],
      "text-anchor": "top",
    },
    paint: { "text-color": "#1d3557", "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });

  let arrival: WindowId = "0800";
  let dest: { lng: number; lat: number } | null = null;
  let result: Result | null = null;
  const marker = new maplibregl.Marker({ color: "#c0392b", draggable: true });
  const breakdownPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "340px", offset: 8 });

  async function update() {
    if (!dest) return;
    breakdownPopup.remove();
    const matrix = await getMatrix(arrival);
    const t0 = performance.now();
    result = compute(stations, matrix, hexes, dest.lat, dest.lng);
    hexes.forEach((hex, i) => {
      map.setFeatureState({ source: "hexes", id: hex.id }, { band: bandOf(result!.hexTimes[i]) });
    });
    const ms = performance.now() - t0;
    marker.setLngLat([dest.lng, dest.lat]).addTo(map);
    hintEl.textContent = "Click a shaded area for the trip breakdown. Drag the pin to move the destination.";
    statusEl.textContent = result.destStations.length
      ? `Updated in ${ms.toFixed(0)} ms`
      : "No station within 1.5 km of that point, so nothing is reachable by train from it.";
  }

  function setDestination(lng: number, lat: number) {
    dest = { lng, lat };
    return update();
  }

  async function showBreakdown(hexIdx: number, at: maplibregl.LngLatLike) {
    if (!result || !dest) return;
    const board = result.boardAt[hexIdx];
    const time = result.hexTimes[hexIdx];
    if (board < 0 || !Number.isFinite(time)) {
      breakdownPopup.setLngLat(at).setHTML("<strong>No route</strong><br>Not reachable by train from here.").addTo(map);
      return;
    }
    const alight = result.alightAt[board];
    const hex = hexes[hexIdx];
    const walkIn = hex.near.find((n) => n.station === board)!.walk;
    const walkOut = result.destStations.find((d) => d.station === alight)!.walk;
    const finder = await getFinder(arrival, stations.length);
    const route = finder.route(board, alight);
    if (!route) return;
    const html = breakdownHtml({
      walkToStation: { name: stations[board].name, minutes: walkIn },
      route,
      stationName: (i) => stations[i].name,
      walkToDestination: {
        name: alight === board && route.segments.length === 0 ? "destination" : `destination from ${stations[alight].name}`,
        minutes: walkOut,
      },
      total: time,
    });
    breakdownPopup
      .setLngLat(at)
      .setHTML(
        `<strong>${Math.round(time)} min to your destination</strong>${html}` +
          `<div class="popup-note">Weekday, arriving around ${arrival === "0800" ? "8:00" : "9:00"} am. Walking is a straight-line estimate; waits are half the average gap between trains.</div>` +
          `<div class="popup-actions"><button type="button" id="set-dest">Set destination here</button></div>`,
      )
      .addTo(map);
    breakdownPopup.getElement()?.querySelector<HTMLButtonElement>("#set-dest")?.addEventListener("click", () => {
      const ll = breakdownPopup.getLngLat();
      void setDestination(ll.lng, ll.lat);
    });
  }

  map.on("click", (e) => {
    if (dest && result) {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["hex-fill"] })[0];
      const idx = hit ? hexIndex.get(hit.properties.id as string) : undefined;
      if (idx !== undefined) {
        void showBreakdown(idx, e.lngLat);
        return;
      }
    }
    void setDestination(e.lngLat.lng, e.lngLat.lat);
  });
  marker.on("dragend", () => {
    const { lng, lat } = marker.getLngLat();
    void setDestination(lng, lat);
  });

  // Arrival-time toggle.
  document.querySelectorAll<HTMLButtonElement>("#arrival button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      arrival = btn.dataset.window as WindowId;
      document.querySelectorAll<HTMLButtonElement>("#arrival button").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      await update();
    });
  });

  // Destination search (Nominatim, one request per submit).
  const searchForm = el<HTMLFormElement>("search");
  const searchInput = el<HTMLInputElement>("search-input");
  searchForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    statusEl.textContent = "Searching…";
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=my" +
        "&viewbox=100.9,3.8,102.4,2.5&bounded=1&q=" + encodeURIComponent(q);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (!hits.length) {
        statusEl.textContent = `No match for "${q}" in the Klang Valley.`;
        return;
      }
      const lng = Number(hits[0].lon);
      const lat = Number(hits[0].lat);
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12) });
      await setDestination(lng, lat);
      statusEl.insertAdjacentHTML("beforeend", ` · ${escapeHtml(hits[0].display_name.split(",").slice(0, 2).join(","))}`);
    } catch {
      statusEl.textContent = "Search failed. You can still click the map.";
    }
  });

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("mousemove", "station-dots", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    popup
      .setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates)
      .setHTML(`<strong>${escapeHtml(String(f.properties.name))}</strong><br>${escapeHtml(String(f.properties.lines))}`)
      .addTo(map);
  });
  map.on("mouseleave", "station-dots", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}

start().catch((err) => {
  statusEl.textContent = `Failed to start: ${err.message}`;
  console.error(err);
});
