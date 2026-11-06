import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { cellToBoundary } from "h3-js";
import "./style.css";
import { breakdownHtml, escapeHtml } from "./breakdown";
import { RouteFinder, type Graph } from "./graph";
import { bandOf, buildHexes, compute, haversineKm, type Hex, type Result } from "./model";
import { NetworkView } from "./networkView";
import type { Station } from "./types";

// Bundlers do not copy MapLibre's worker next to the main bundle, so serve it explicitly.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const KL_CENTER: [number, number] = [101.6869, 3.139];
const BAND_COLORS = ["#0b5394", "#3d8fd1", "#9cc9ec", "#d4d4d4"];
const BAND_LABELS = ["Under 30 min", "30–45 min", "45–60 min", "Over 60 min"];
/** One-tap destinations: chip label and the station name to use. */
const QUICK_PICKS = [
  { label: "KL Sentral", station: "KL Sentral" },
  { label: "KLCC", station: "KLCC" },
  { label: "Bukit Bintang", station: "Bukit Bintang" },
  { label: "Mid Valley", station: "Perhentian Midvalley" },
  { label: "Subang Jaya", station: "Subang Jaya" },
  { label: "Sunway", station: "Sunway Lagoon" },
];

type Matrix = (number | null)[][];
interface Destination {
  lng: number;
  lat: number;
  label: string;
  chip?: string;
}

async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = el("panel");
const statusEl = el("status");
const summaryEl = el("summary");
const peekEl = el("peek");
const isPhone = () => window.matchMedia("(max-width: 600px)").matches;
const PEEK_EXAMPLE = "Example destination. Tap Options to choose your own.";
const PEEK_TIP = "Tap a coloured area to see the trip. Tap Options to change the destination.";

el("legend").innerHTML = BAND_LABELS.map(
  (label, i) => `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label}</li>`,
).join("");

el("mini-legend").innerHTML = ["Under 30", "30–45", "45–60", "Over 60"]
  .map((label, i) => `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label} min</li>`)
  .join("");

// Panel: collapsible, and on phones it is a bottom sheet that keeps the map controls clear of it.
const collapseBtn = el<HTMLButtonElement>("collapse");
function setCollapsed(collapsed: boolean) {
  panel.classList.toggle("collapsed", collapsed);
  collapseBtn.textContent = collapsed ? "Options" : "Hide";
  collapseBtn.setAttribute("aria-expanded", String(!collapsed));
}
collapseBtn.addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));

const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: KL_CENTER,
  zoom: 10.3,
  maxBounds: [[100.9, 2.5], [102.4, 3.8]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// `?debug` exposes the map for automated browser checks.
if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __map: maplibregl.Map }).__map = map;

// On phones the panel is a bottom sheet: keep map controls above it and centre the map in what is left.
new ResizeObserver(() => {
  const h = isPhone() ? panel.offsetHeight : 0;
  document.documentElement.style.setProperty("--sheet-h", `${h}px`);
  map.setPadding({ top: 0, left: 0, right: 0, bottom: h });
}).observe(panel);

const stationsPromise = loadJson<Station[]>("stations.json");
const mapLoaded = new Promise<void>((resolve) => map.on("load", () => resolve()));

// The matrix loads up front; the route graph loads the first time a breakdown is requested.
const matrixPromise = loadJson<Matrix>("matrix.json");
let finderPromise: Promise<RouteFinder> | null = null;
const getFinder = (stationCount: number) => {
  finderPromise ??= loadJson<Graph>("graph.json").then((g) => new RouteFinder(g, stationCount));
  return finderPromise;
};

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

function addMapLayers(stations: Station[], hexes: Hex[]) {
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
      features: stations.map((s, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { i, name: s.name, lines: s.lines.join(", ") },
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
    minzoom: 11.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1],
      "text-anchor": "top",
    },
    paint: { "text-color": "#1d3557", "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });
}

async function start() {
  const [stations] = await Promise.all([stationsPromise, mapLoaded]);
  const hexes = buildHexes(stations);
  const hexIndex = new Map(hexes.map((h, i) => [h.id, i]));
  addMapLayers(stations, hexes);

  let dest: Destination | null = null;
  let result: Result | null = null;
  let picking = false;
  let mode: "commute" | "network" = "commute";

  const marker = new maplibregl.Marker({ color: "#c0392b", draggable: true });
  const pinLabel = document.createElement("span");
  pinLabel.className = "pin-label";
  pinLabel.textContent = "Destination";
  marker.getElement().appendChild(pinLabel);
  marker.getElement().title = "Your destination. Drag to move it.";
  const breakdownPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "340px", offset: 8 });

  function nearestLabel(lng: number, lat: number): string {
    let best = 0;
    let bestKm = Infinity;
    stations.forEach((s, i) => {
      const km = haversineKm(lat, lng, s.lat, s.lon);
      if (km < bestKm) [best, bestKm] = [i, km];
    });
    return `your pin near ${stations[best].name}`;
  }

  function setPicking(on: boolean) {
    picking = on;
    el("pick").classList.toggle("on", on);
    el("pick").textContent = on ? "Tap the map to place it (cancel)" : "Or pick a spot on the map";
    document.body.classList.toggle("picking", on);
    if (on) {
      statusEl.textContent = "Tap anywhere on the map to place your destination.";
      if (isPhone()) setCollapsed(true);
    }
  }

  async function update() {
    if (!dest) return;
    breakdownPopup.remove();
    const matrix = await matrixPromise;
    const started = performance.now();
    result = compute(stations, matrix, hexes, dest.lat, dest.lng);
    hexes.forEach((hex, i) => {
      map.setFeatureState({ source: "hexes", id: hex.id }, { band: bandOf(result!.hexTimes[i]) });
    });
    console.debug(`recomputed in ${(performance.now() - started).toFixed(1)} ms`);
    marker.setLngLat([dest.lng, dest.lat]).addTo(map);
    summaryEl.textContent = `Train time to ${dest.label}, weekday morning`;
    el("legend-title").textContent = `Time from each area to ${dest.label}:`;
    document.querySelectorAll<HTMLButtonElement>("#chips button").forEach((b) => {
      b.classList.toggle("on", b.dataset.chip === dest!.chip);
    });
    peekEl.textContent = PEEK_TIP;
    statusEl.textContent = result.destStations.length
      ? "Tap a coloured area to see how you would get there."
      : "No station within a 1.5 km walk of that spot, so nothing is reachable by train from it. Try somewhere closer to a station.";
  }

  function setDestination(d: Destination) {
    dest = d;
    setPicking(false);
    if (isPhone()) setCollapsed(true);
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
    const walkIn = hexes[hexIdx].near.find((n) => n.station === board)!.walk;
    const walkOut = result.destStations.find((d) => d.station === alight)!.walk;
    const route = (await getFinder(stations.length)).route(board, alight);
    if (!route) return;
    const html = breakdownHtml({
      walkToStation: { name: stations[board].name, minutes: walkIn },
      route,
      stationName: (i) => stations[i].name,
      walkToDestination: { name: dest.label, minutes: walkOut },
      total: time,
    });
    breakdownPopup
      .setLngLat(at)
      .setHTML(
        `<strong>${Math.round(time)} min from here to ${escapeHtml(dest.label)}</strong>${html}` +
          `<div class="popup-note">Weekday morning (trains departing 7–9 am). Walks are straight-line estimates; waits are half the average gap between trains.</div>` +
          `<div class="popup-actions"><button type="button" id="set-dest">Use this spot as my destination</button></div>`,
      )
      .addTo(map);
    breakdownPopup.getElement()?.querySelector<HTMLButtonElement>("#set-dest")?.addEventListener("click", () => {
      const ll = breakdownPopup.getLngLat();
      void setDestination({ lng: ll.lng, lat: ll.lat, label: nearestLabel(ll.lng, ll.lat) });
    });
    if (isPhone()) setCollapsed(true);
  }

  map.on("click", (e) => {
    if (mode === "network") {
      netView.handleClick(e.point);
      return;
    }
    if (picking) {
      void setDestination({ lng: e.lngLat.lng, lat: e.lngLat.lat, label: nearestLabel(e.lngLat.lng, e.lngLat.lat) });
      return;
    }
    if (!dest || !result) return;
    const hit = map.queryRenderedFeatures(e.point, { layers: ["hex-fill"] })[0];
    const idx = hit ? hexIndex.get(hit.properties.id as string) : undefined;
    if (idx !== undefined) {
      void showBreakdown(idx, e.lngLat);
    } else {
      statusEl.textContent =
        'Tap a coloured area for its trip. To move your destination, search, use a quick pick, or choose "pick a spot on the map".';
      if (isPhone()) setCollapsed(false);
    }
  });
  marker.on("dragend", () => {
    const { lng, lat } = marker.getLngLat();
    void setDestination({ lng, lat, label: nearestLabel(lng, lat) });
  });
  el("pick").addEventListener("click", () => setPicking(!picking));

  // Quick picks: one tap to a common destination.
  const chips = el("chips");
  for (const pick of QUICK_PICKS) {
    const matches = stations.filter((s) => s.name.toLowerCase() === pick.station.toLowerCase());
    if (!matches.length) continue;
    const s = matches.reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = pick.label;
    btn.dataset.chip = pick.label;
    btn.addEventListener("click", () => {
      map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 10.8) });
      void setDestination({ lng: s.lon, lat: s.lat, label: pick.label, chip: pick.label });
    });
    chips.appendChild(btn);
  }

  // Destination search (Nominatim, one request per submit).
  el<HTMLFormElement>("search").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const q = el<HTMLInputElement>("search-input").value.trim();
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
        statusEl.textContent = `No match for "${q}" in the Klang Valley. Try a nearby landmark or station name.`;
        return;
      }
      const lng = Number(hits[0].lon);
      const lat = Number(hits[0].lat);
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12) });
      await setDestination({ lng, lat, label: hits[0].display_name.split(",")[0] });
    } catch {
      statusEl.textContent = "Search is unavailable right now. Use a quick pick or tap the map instead.";
    }
  });

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("mousemove", "station-dots", (e) => {
    const f = e.features?.[0];
    if (!f || picking) return;
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

  // Two views of the same map: the commute map, and the live train network.
  const netView = new NetworkView(map, stations, {
    isPhone,
    useAsDestination(i) {
      const s = stations[i];
      void setMode("commute").then(() => {
        map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 10.8) });
        return setDestination({ lng: s.lon, lat: s.lat, label: s.name });
      });
    },
  });
  async function setMode(next: "commute" | "network") {
    if (next === mode) return;
    mode = next;
    document.body.dataset.mode = next;
    document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    el("mode-commute").hidden = next !== "commute";
    el("mode-network").hidden = next !== "network";
    el("head-play").hidden = next !== "network";
    if (next === "network") {
      setPicking(false);
      breakdownPopup.remove();
      marker.remove();
      map.setLayoutProperty("hex-fill", "visibility", "none");
      statusEl.textContent = "";
      if (isPhone()) setCollapsed(true);
      try {
        await netView.enter();
      } catch (err) {
        statusEl.textContent = "Could not load the train timetable. Try again later.";
        console.error(err);
      }
    } else {
      netView.leave();
      map.setLayoutProperty("hex-fill", "visibility", "visible");
      summaryEl.textContent = "Loading…";
      await update();
    }
  }
  document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((b) => {
    b.addEventListener("click", () => void setMode(b.dataset.mode as "commute" | "network"));
  });

  // Start with a worked example so the first screen already shows what the site does.
  const start = chips.querySelector<HTMLButtonElement>("button");
  const first = QUICK_PICKS[0];
  const klSentral = stations
    .filter((s) => s.name === first.station)
    .reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
  await setDestination({ lng: klSentral.lon, lat: klSentral.lat, label: first.label, chip: first.label });
  // Desktop keeps the guide open; on a phone start with the map in view and a short strip below it.
  setCollapsed(isPhone());
  start?.blur();
  peekEl.textContent = PEEK_EXAMPLE;
  statusEl.textContent = "This is an example. Change the destination in step 1 to see your own commute.";
}

start().catch((err) => {
  summaryEl.textContent = "Something went wrong";
  statusEl.textContent = `Failed to start: ${err.message}`;
  console.error(err);
});
