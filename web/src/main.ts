import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { cellToBoundary } from "h3-js";
import "./style.css";
import { bandOf, buildHexes, compute, type Hex } from "./model";
import type { Station } from "./types";

// Bundlers do not copy MapLibre's worker next to the main bundle, so serve it explicitly.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const KL_CENTER: [number, number] = [101.6869, 3.139];

const BAND_COLORS = ["#0b5394", "#3d8fd1", "#9cc9ec", "#d4d4d4"];
const BAND_LABELS = ["Under 30 min", "30–45 min", "45–60 min", "Over 60 min"];

async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

const legend = document.getElementById("legend")!;
legend.innerHTML = BAND_LABELS.map(
  (label, i) =>
    `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label}${i === 3 ? " or no station nearby" : ""}</li>`,
).join("");
const statusEl = document.getElementById("status")!;
const hintEl = document.getElementById("hint")!;

const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: KL_CENTER,
  zoom: 10.3,
  maxBounds: [[100.9, 2.5], [102.4, 3.8]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

const dataPromise = Promise.all([
  loadJson<Station[]>("stations.json"),
  loadJson<(number | null)[][]>("matrix.json"),
]);
const mapLoaded = new Promise<void>((resolve) => map.on("load", () => resolve()));

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
  const [[stations, matrix]] = await Promise.all([dataPromise, mapLoaded]);
  const hexes = buildHexes(stations);

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

  const marker = new maplibregl.Marker({ color: "#c0392b", draggable: true });

  function setDestination(lng: number, lat: number) {
    const t0 = performance.now();
    const result = compute(stations, matrix, hexes, lat, lng);
    hexes.forEach((hex, i) => {
      map.setFeatureState({ source: "hexes", id: hex.id }, { band: bandOf(result.hexTimes[i]) });
    });
    const ms = performance.now() - t0;
    marker.setLngLat([lng, lat]).addTo(map);
    hintEl.textContent = "Drag the pin or click elsewhere to change destination.";
    statusEl.textContent = result.destStations.length
      ? `Updated in ${ms.toFixed(0)} ms`
      : "No station within 1.5 km of that point, so nothing is reachable by train from it.";
  }

  map.on("click", (e) => setDestination(e.lngLat.lng, e.lngLat.lat));
  marker.on("dragend", () => {
    const { lng, lat } = marker.getLngLat();
    setDestination(lng, lat);
  });

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("mousemove", "station-dots", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    popup
      .setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates)
      .setHTML(`<strong>${f.properties.name}</strong><br>${f.properties.lines}`)
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
