import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource-variable/inter/wght.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { cellToBoundary } from "h3-js";
import "./style.css";
import { BasemapController, type Basemap } from "./basemap";
import { breakdownHtml, escapeHtml } from "./breakdown";
import { RouteFinder, type Graph } from "./graph";
import { BUS, RIDE, WALK, bandOf, buildHexes, compute, haversineKm, slowest, type Access, type FeederStop, type Hex, type Near, type Result } from "./model";
import { NetworkView } from "./networkView";
import type { Station } from "./types";

// Bundlers do not copy MapLibre's worker next to the main bundle, so serve it explicitly.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
/** Used when the OpenFreeMap style cannot be fetched: plain OpenStreetMap tiles, with fonts from MapLibre's demo server. */
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
let usingFallbackStyle = false;
/** The detailed style, or the fallback when the free service is down or too slow. */
async function loadStyle(): Promise<maplibregl.StyleSpecification> {
  try {
    const res = await fetch(STYLE_URL, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error(String(res.status));
    const style = (await res.json()) as maplibregl.StyleSpecification;
    if (!Array.isArray(style.layers)) throw new Error("not a style");
    return style;
  } catch {
    usingFallbackStyle = true;
    return FALLBACK_STYLE;
  }
}
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

/** The Klang Valley box the map is limited to. */
const inValley = (lat: number, lng: number) => lat >= 2.5 && lat <= 3.8 && lng >= 100.9 && lng <= 102.4;

interface Meta {
  built: string;
  feeds: Record<string, { valid_from: string | null; valid_to: string | null }>;
}
const prettyDate = (d: string) => {
  const iso = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

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
el("grabber").addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));

const map = new maplibregl.Map({
  container: "map",
  center: KL_CENTER,
  zoom: 10.3,
  maxBounds: [[100.9, 2.5], [102.4, 3.8]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
const basemap = new BasemapController(map);
void loadStyle().then((style) => map.setStyle(style));

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
type When = "am" | "pm" | "sat" | "sun";
const WHEN: Record<When, { suffix: string; label: string; hours: string }> = {
  am: { suffix: "", label: "weekday morning", hours: "Weekday morning (trains departing 7–9 am)" },
  pm: { suffix: "-pm", label: "weekday evening", hours: "Weekday evening (trains departing 5–7:30 pm)" },
  sat: { suffix: "-sat", label: "Saturday", hours: "Saturday (trains departing 10 am–12 pm)" },
  sun: { suffix: "-sun", label: "Sunday", hours: "Sunday (trains departing 10 am–12 pm)" },
};
const matrices = new Map<When, Promise<Matrix>>([["am", loadJson<Matrix>("matrix.json")]]);
const getMatrix = (when: When) => {
  if (!matrices.has(when)) matrices.set(when, loadJson<Matrix>(`matrix${WHEN[when].suffix}.json`));
  return matrices.get(when)!;
};
const feeders = new Map<When, Promise<FeederStop[]>>();
const getFeeder = (when: When) => {
  if (!feeders.has(when)) feeders.set(when, loadJson<FeederStop[]>(`feeder${WHEN[when].suffix}.json`));
  return feeders.get(when)!;
};
const finders = new Map<When, Promise<RouteFinder>>();
const getFinder = (when: When, stationCount: number) => {
  if (!finders.has(when)) {
    finders.set(when, loadJson<Graph>(`graph${WHEN[when].suffix}.json`).then((g) => new RouteFinder(g, stationCount)));
  }
  return finders.get(when)!;
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
      "fill-opacity": ["match", ["feature-state", "band"], 3, 0.35, 0.62],
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
  const initial = new URLSearchParams(location.hash.slice(1));
  const via = initial.get("via");
  let access: Access = via === "ride" ? RIDE : via === "bus" ? BUS : WALK;
  const whenParam = initial.get("when");
  let when: When = whenParam === "pm" || whenParam === "sat" || whenParam === "sun" ? whenParam : "am";
  let reverse = initial.get("dir") === "from";
  /** Feeder bus stops for the chosen time of day; empty unless the bus option is on. */
  let feeder: FeederStop[] = access.id === "bus" ? await getFeeder(when) : [];
  let hexes = buildHexes(stations, access, feeder);
  let hexIndex = new Map(hexes.map((h, i) => [h.id, i]));
  basemap.init();
  const noteFallback = () => {
    if (usingFallbackStyle) {
      statusEl.textContent += " The detailed base map service is not responding, so a simpler map is shown; everything else works as usual.";
    }
  };
  addMapLayers(stations, hexes);
  if (isPhone()) {
    // MapLibre opens its attribution by default; on a phone it would cover a third of the map.
    const attribution = document.querySelector(".maplibregl-ctrl-attrib");
    attribution?.removeAttribute("open");
    attribution?.classList.remove("maplibregl-compact-show");
  }

  // Map / Satellite. Our overlays are drawn a little stronger over imagery.
  basemap.onChange = (mode: Basemap) => {
    document.body.dataset.basemap = mode;
    document.querySelectorAll<HTMLButtonElement>("#basemap button").forEach((b) => {
      const on = b.dataset.basemap === mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const sat = mode === "satellite";
    map.setPaintProperty("hex-fill", "fill-opacity", ["match", ["feature-state", "band"], 3, sat ? 0.5 : 0.35, sat ? 0.74 : 0.62]);
    try {
      localStorage.setItem("basemap", mode);
    } catch {
      /* private mode: the choice just is not remembered */
    }
  };
  document.querySelectorAll<HTMLButtonElement>("#basemap button").forEach((b) => {
    b.addEventListener("click", () => basemap.set(b.dataset.basemap as Basemap));
  });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("basemap");
  } catch {
    /* ignore */
  }
  basemap.set(saved === "satellite" ? "satellite" : "map");

  const dests: (Destination | null)[] = [null, null];
  const results: (Result | null)[] = [null, null];
  /** Which destination search, quick picks and pin placement change: 0 is A, 1 is B. */
  let slot = 0;
  let picking = false;
  let mode: "commute" | "network" = "commute";

  const PIN_COLORS = ["#c0392b", "#6c3fc5"];
  const slotName = (i: number) => (i === 0 ? "A" : "B");
  const shortLabel = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);
  const markers = PIN_COLORS.map((color, i) => {
    const m = new maplibregl.Marker({ color, draggable: true });
    const label = document.createElement("span");
    label.className = "pin-label";
    label.textContent = "Destination";
    m.getElement().appendChild(label);
    m.getElement().title = "Drag to move this destination.";
    m.on("dragend", () => {
      const { lng, lat } = m.getLngLat();
      void setDestination({ lng, lat, label: nearestLabel(lng, lat) }, i);
    });
    return m;
  });
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

  /** Keep the address bar describing the current view, so the link can be shared. */
  function writeHash() {
    const [a, b] = dests;
    if (!a) return;
    const p = new URLSearchParams({ to: `${a.lat.toFixed(5)},${a.lng.toFixed(5)}`, name: a.label });
    if (b) {
      p.set("to2", `${b.lat.toFixed(5)},${b.lng.toFixed(5)}`);
      p.set("name2", b.label);
    }
    if (access.id !== "walk") p.set("via", access.id);
    if (when !== "am") p.set("when", when);
    if (reverse) p.set("dir", "from");
    history.replaceState(null, "", `#${p.toString().replaceAll("%2C", ",")}`);
  }

  function showAccess() {
    document.querySelectorAll<HTMLButtonElement>("#access button").forEach((b) => {
      const on = b.dataset.access === access.id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    el("access").style.setProperty("--i", String(["walk", "bus", "ride"].indexOf(access.id)));
    el("access-note").textContent =
      access.id === "walk"
        ? "Stations within a 1.5 km walk, at 4.5 km/h."
        : access.id === "bus"
          ? "A walk of up to 1.5 km to a station, or up to 500 m to a Rapid KL feeder bus stop whose bus goes to one (53 stations have them). Includes the wait for the bus."
          : "Walk to stations up to 1.5 km away; beyond that, a bike, scooter or e-hailed car up to 4 km at about 20 km/h, plus 4 minutes to get going.";
  }

  function showWhen() {
    const sync = (id: string, attr: string, current: string, index: number) => {
      document.querySelectorAll<HTMLButtonElement>(`#${id} button`).forEach((b) => {
        const on = b.dataset[attr] === current;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      el(id).style.setProperty("--i", String(index));
    };
    sync("when", "when", when, ["am", "pm", "sat", "sun"].indexOf(when));
    sync("dir", "dir", reverse ? "from" : "to", reverse ? 1 : 0);
    el("when-note").textContent = reverse
      ? `${WHEN[when].hours}. Shows how long the trip takes from your destination to each area, for example the trip home.`
      : `${WHEN[when].hours}. Pick "coming back" to see the trip home instead.`;
  }

  async function setWhen(nextWhen: When, nextReverse: boolean) {
    if (nextWhen === when && nextReverse === reverse) return;
    const previous = when;
    when = nextWhen;
    reverse = nextReverse;
    showWhen();
    if (access.id === "bus" && nextWhen !== previous) await rebuildHexes();
    await update();
  }

  async function setAccess(next: Access) {
    if (next === access) return;
    access = next;
    showAccess();
    await rebuildHexes();
    await update();
  }

  /** The grid depends on how you reach a station (and, for feeder buses, on the time of day). */
  async function rebuildHexes() {
    feeder = access.id === "bus" ? await getFeeder(when) : [];
    hexes = buildHexes(stations, access, feeder);
    hexIndex = new Map(hexes.map((h, i) => [h.id, i]));
    (map.getSource("hexes") as maplibregl.GeoJSONSource).setData(hexFeatures(hexes));
  }

  function showSlots() {
    document.querySelectorAll<HTMLButtonElement>("#slots button").forEach((b) => {
      const on = Number(b.dataset.slot) === slot;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    el("slots").style.setProperty("--i", String(slot));
    const second = el<HTMLButtonElement>("slots").querySelector<HTMLButtonElement>("button[data-slot='1']")!;
    second.textContent = dests[1] ? "Destination B" : "Add a second (B)";
    const d = dests[slot];
    el("slot-note").textContent = d
      ? `Choosing destination ${slotName(slot)}: ${d.label}. Search, tap a quick pick, pick a spot or drag its pin to change it.`
      : slot === 1
        ? "Choose a second place you need to get to. The map then shows the longer of the two commutes."
        : "Search, tap a quick pick or pick a spot on the map.";
    el("remove-b").hidden = !(slot === 1 && dests[1]);
  }

  function setSlot(next: number) {
    slot = next;
    setPicking(false);
    showSlots();
    document.querySelectorAll<HTMLButtonElement>("#chips button").forEach((b) => {
      b.classList.toggle("on", b.dataset.chip === dests[slot]?.chip);
    });
    if (slot === 1 && !dests[1]) statusEl.textContent = "Now choose destination B: search, tap a quick pick or pick a spot on the map.";
  }

  async function update() {
    if (!dests.some(Boolean)) return;
    breakdownPopup.remove();
    const matrix = await getMatrix(when);
    const started = performance.now();
    dests.forEach((d, i) => {
      results[i] = d ? compute(stations, matrix, hexes, d.lat, d.lng, access, reverse, feeder) : null;
    });
    const active = results.filter((r): r is Result => r !== null);
    const times = active.length === 2 ? slowest(active) : active[0].hexTimes;
    hexes.forEach((hex, i) => {
      map.setFeatureState({ source: "hexes", id: hex.id }, { band: bandOf(times[i]) });
    });
    console.debug(`recomputed in ${(performance.now() - started).toFixed(1)} ms`);
    const compare = active.length === 2;
    dests.forEach((d, i) => {
      if (!d) {
        markers[i].remove();
        return;
      }
      markers[i].setLngLat([d.lng, d.lat]).addTo(map);
      markers[i].getElement().querySelector(".pin-label")!.textContent = compare ? `${slotName(i)}: ${shortLabel(d.label)}` : "Destination";
    });
    const names = dests.filter((d): d is Destination => d !== null).map((d) => d.label).join(" and ");
    const dir = reverse ? "from" : "to";
    summaryEl.textContent = compare
      ? `Slower commute ${dir} ${names}, ${WHEN[when].label}`
      : `Train time ${dir} ${names}, ${WHEN[when].label}`;
    el("legend-title").textContent = compare
      ? `The longer of the two trips, ${dir} ${names}:`
      : reverse
        ? `Time from ${names} to each area:`
        : `Time from each area to ${names}:`;
    showSlots();
    document.querySelectorAll<HTMLButtonElement>("#chips button").forEach((b) => {
      b.classList.toggle("on", b.dataset.chip === dests[slot]?.chip);
    });
    peekEl.textContent = PEEK_TIP;
    const stranded = dests.flatMap((d, i) => (d && !results[i]!.destStations.length ? [slotName(i)] : []));
    statusEl.textContent = stranded.length
      ? `No station within ${access.reach} of destination ${stranded.join(" or ")}, so nothing is reachable by train from it. Try somewhere closer to a station.`
      : compare
        ? "Tap a coloured area to see both trips from there."
        : "Tap a coloured area to see how you would get there.";
    writeHash();
  }

  function setDestination(d: Destination, i = slot) {
    dests[i] = d;
    slot = i;
    setPicking(false);
    if (isPhone()) setCollapsed(true);
    return update();
  }

  /** The trip between a hex and destination i: the table of steps and the minutes, or null if there is none. */
  async function tripFor(i: number, hexIdx: number): Promise<{ html: string; time: number } | null> {
    const dest = dests[i];
    const result = results[i];
    if (!dest || !result) return null;
    const board = result.boardAt[hexIdx];
    const time = result.hexTimes[hexIdx];
    if (board < 0 || !Number.isFinite(time)) return null;
    const alight = result.alightAt[board];
    const minutesOf = (n: Near) => (reverse ? (n.back ?? n.walk) : n.walk);
    const hexLeg = hexes[hexIdx].near.filter((n) => n.station === board).reduce((a, b) => (minutesOf(b) < minutesOf(a) ? b : a));
    const destLeg = result.destStations.filter((d) => d.station === alight).reduce((a, b) => (b.walk < a.walk ? b : a));
    const walkIn = minutesOf(hexLeg);
    const walkOut = destLeg.walk;
    // Going there, the place's own leg gets you onto the train and the destination's gets you off; coming back, the reverse.
    const busWords = (route: string | undefined, boarding: boolean) =>
      route ? (boarding ? `Walk, then bus ${route}` : `Bus ${route}, then walk`) : undefined;
    const hexVia = busWords(hexLeg.via, !reverse);
    const destVia = busWords(destLeg.via, reverse);
    const finder = await getFinder(when, stations.length);
    const route = reverse ? finder.route(alight, board) : finder.route(board, alight);
    if (!route) return null;
    const html = breakdownHtml({
      walkToStation: reverse
        ? { name: stations[alight].name, minutes: walkOut, via: destVia }
        : { name: stations[board].name, minutes: walkIn, via: hexVia },
      route,
      stationName: (k) => stations[k].name,
      walkToDestination: reverse
        ? { name: "this spot", minutes: walkIn, via: hexVia }
        : { name: dest.label, minutes: walkOut, via: destVia },
      total: time,
      verb: access.verb,
    });
    return { html, time };
  }

  async function showBreakdown(hexIdx: number, at: maplibregl.LngLatLike) {
    const used = [0, 1].filter((i) => dests[i] && results[i]);
    if (!used.length) return;
    const trips = await Promise.all(used.map((i) => tripFor(i, hexIdx)));
    const phrase = (i: number) => (reverse ? `from ${escapeHtml(dests[i]!.label)} to here` : `from here to ${escapeHtml(dests[i]!.label)}`);
    let body: string;
    if (used.length === 1) {
      const t = trips[0];
      body = t
        ? `<strong>${Math.round(t.time)} min ${phrase(used[0])}</strong>${t.html}`
        : "<strong>No route</strong><br>Not reachable by train from here.";
    } else {
      const times = trips.map((t) => t?.time ?? Infinity);
      const worst = Math.max(...times);
      body = Number.isFinite(worst)
        ? `<strong>${Math.round(worst)} min for the slower trip</strong>`
        : "<strong>No route</strong> to one of the destinations from here.";
      body += used
        .map((i, k) => {
          const t = trips[k];
          const badge = `<span class="slot-badge" style="background:${PIN_COLORS[i]}">${slotName(i)}</span>`;
          return t
            ? `<div class="trip-head">${badge}${Math.round(t.time)} min ${phrase(i)}</div>${t.html}`
            : `<div class="trip-head">${badge}${phrase(i)}</div><p class="small">Not reachable by train from here.</p>`;
        })
        .join("");
    }
    const target = dests[1] || slot === 1 ? ` as destination ${slotName(slot)}` : " as my destination";
    breakdownPopup
      .setLngLat(at)
      .setHTML(
        `${body}<div class="popup-note">${WHEN[when].hours}. Walks and rides to stations are straight-line estimates; waits are half the average gap between trains.</div>` +
          `<div class="popup-actions"><button type="button" id="set-dest">Use this spot${target}</button></div>`,
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
    if (!dests.some(Boolean)) return;
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
  el("pick").addEventListener("click", () => setPicking(!picking));
  document.querySelectorAll<HTMLButtonElement>("#slots button").forEach((b) => {
    b.addEventListener("click", () => setSlot(Number(b.dataset.slot)));
  });
  el("remove-b").addEventListener("click", () => {
    dests[1] = null;
    results[1] = null;
    setSlot(0);
    void update();
  });

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

  // Destination search: station names first (instant, offline), then Nominatim, then Photon as a backup.
  type Place = { lng: number; lat: number; label: string };
  const BBOX = { west: 100.9, south: 2.5, east: 102.4, north: 3.8 };
  const viaNominatim = async (q: string): Promise<Place | null> => {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=my" +
      `&viewbox=${BBOX.west},${BBOX.north},${BBOX.east},${BBOX.south}&bounded=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return hits.length ? { lng: Number(hits[0].lon), lat: Number(hits[0].lat), label: hits[0].display_name.split(",")[0] } : null;
  };
  const viaPhoton = async (q: string): Promise<Place | null> => {
    const url = `https://photon.komoot.io/api/?limit=1&bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { name?: string } }[] };
    const f = body.features[0];
    return f ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.name ?? q } : null;
  };
  let lastLookup = 0;
  const lookups = new Map<string, Place | null>();
  /** Null when nothing matches; throws when no search service answered. */
  async function geocode(q: string): Promise<Place | null> {
    const lower = q.toLowerCase();
    const station =
      stations.find((s) => s.name.toLowerCase() === lower) ??
      (lower.length >= 3 ? stations.find((s) => s.name.toLowerCase().includes(lower)) : undefined);
    if (station) return { lng: station.lon, lat: station.lat, label: station.name };
    if (lookups.has(lower)) return lookups.get(lower)!;
    // Nominatim's usage policy: at most one request per second.
    const wait = 1100 - (Date.now() - lastLookup);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastLookup = Date.now();
    let answered = false;
    for (const lookup of [viaNominatim, viaPhoton]) {
      try {
        const hit = await lookup(q);
        answered = true;
        if (hit && inValley(hit.lat, hit.lng)) {
          lookups.set(lower, hit);
          return hit;
        }
      } catch {
        /* try the next service */
      }
    }
    if (!answered) throw new Error("search unavailable");
    lookups.set(lower, null);
    return null;
  }
  el<HTMLFormElement>("search").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const q = el<HTMLInputElement>("search-input").value.trim();
    if (!q) return;
    statusEl.textContent = "Searching…";
    try {
      const hit = await geocode(q);
      if (!hit) {
        statusEl.textContent = `No match for "${q}" in the Klang Valley. Try a nearby landmark or station name.`;
        return;
      }
      map.flyTo({ center: [hit.lng, hit.lat], zoom: Math.max(map.getZoom(), 12) });
      await setDestination(hit);
    } catch {
      statusEl.textContent = "Search is unavailable right now. Use a quick pick or tap the map instead.";
    }
  });

  // How you reach a station, and sharing.
  document.querySelectorAll<HTMLButtonElement>("#access button").forEach((b) => {
    b.addEventListener("click", () => void setAccess(b.dataset.access === "ride" ? RIDE : b.dataset.access === "bus" ? BUS : WALK));
  });
  document.querySelectorAll<HTMLButtonElement>("#when button").forEach((b) => {
    b.addEventListener("click", () => void setWhen(b.dataset.when as When, reverse));
  });
  document.querySelectorAll<HTMLButtonElement>("#dir button").forEach((b) => {
    b.addEventListener("click", () => void setWhen(when, b.dataset.dir === "from"));
  });
  showAccess();
  showWhen();
  el("share").addEventListener("click", async () => {
    const btn = el("share");
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = "Link copied";
    } catch {
      statusEl.textContent = "Copy the address from your browser's address bar to share this map.";
    }
    setTimeout(() => (btn.textContent = "Copy a link to this map"), 1800);
  });

  // "Data as of": when the timetable was built, and a warning if a feed has expired.
  void loadJson<Meta>("meta.json")
    .then((m) => {
      const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const expired = Object.values(m.feeds).some((f) => f.valid_to && f.valid_to < today);
      el("data-info").textContent =
        `Timetable data built ${prettyDate(m.built)}.` + (expired ? " Part of this timetable has expired, so some times may be out of date." : "");
    })
    .catch(() => undefined);

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
      markers.forEach((m) => m.remove());
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

  // A shared link opens straight onto its destination.
  const hash = new URLSearchParams(location.hash.slice(1));
  const [sharedLat, sharedLng] = (hash.get("to") ?? "").split(",").map(Number);
  if (Number.isFinite(sharedLat) && Number.isFinite(sharedLng) && inValley(sharedLat, sharedLng)) {
    const name = (hash.get("name") ?? "").slice(0, 80) || nearestLabel(sharedLng, sharedLat);
    map.jumpTo({ center: [sharedLng, sharedLat], zoom: Math.max(map.getZoom(), 10.8) });
    showAccess();
    await setDestination({ lng: sharedLng, lat: sharedLat, label: name, chip: QUICK_PICKS.find((p) => p.label === name)?.label }, 0);
    const [lat2, lng2] = (hash.get("to2") ?? "").split(",").map(Number);
    if (Number.isFinite(lat2) && Number.isFinite(lng2) && inValley(lat2, lng2)) {
      await setDestination({ lng: lng2, lat: lat2, label: (hash.get("name2") ?? "").slice(0, 80) || nearestLabel(lng2, lat2) }, 1);
      setSlot(0);
    }
    setCollapsed(isPhone());
    noteFallback();
    return;
  }

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
  noteFallback();
}

start().catch((err) => {
  summaryEl.textContent = "Something went wrong";
  statusEl.textContent = `Failed to start: ${err.message}`;
  console.error(err);
});
