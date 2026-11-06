import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource-variable/inter/wght.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { cellToBoundary } from "h3-js";
import "./style.css";
import { BasemapController, type Basemap } from "./basemap";
import { applyStatic, lang, locale, setLang, t, type Key } from "./i18n";
import { breakdownHtml, escapeHtml } from "./breakdown";
import { RouteFinder, type Graph } from "./graph";
import { BUS, RIDE, WALK, bandOf, buildHexes, combine, combineValues, commuteFrom, compute, haversineKm, stationsNear, type Access, type Measure, type FeederStop, type Hex, type Near, type Result } from "./model";
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
const BAND_LABELS = (["band.u30", "band.30", "band.45", "band.o60"] as Key[]).map((k) => t(k));
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
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
const PEEK_EXAMPLE = t("peek.example");
const PEEK_TIP = t("peek.tip");
applyStatic();
const langToggle = el<HTMLButtonElement>("lang-toggle");
langToggle.textContent = t("lang.switch.short");
langToggle.title = t("lang.switch");
langToggle.lang = lang === "en" ? "ms" : "en";
langToggle.addEventListener("click", () => setLang(lang === "en" ? "ms" : "en"));

el("legend").innerHTML = BAND_LABELS.map(
  (label, i) => `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label}</li>`,
).join("");

el("mini-legend").innerHTML = BAND_LABELS.map(
  (label, i) => `<li><span class="swatch" style="background:${BAND_COLORS[i]}"></span>${label}</li>`,
).join("");

// Panel: collapsible, and on phones it is a bottom sheet that keeps the map controls clear of it.
const collapseBtn = el<HTMLButtonElement>("collapse");
function setCollapsed(collapsed: boolean) {
  panel.classList.toggle("collapsed", collapsed);
  collapseBtn.textContent = collapsed ? t("collapse.options") : t("collapse.hide");
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
  am: { suffix: "", label: t("when.label.am"), hours: t("when.hours.am") },
  pm: { suffix: "-pm", label: t("when.label.pm"), hours: t("when.hours.pm") },
  sat: { suffix: "-sat", label: t("when.label.sat"), hours: t("when.hours.sat") },
  sun: { suffix: "-sun", label: t("when.label.sun"), hours: t("when.hours.sun") },
};
// With the Bus choice the trains are joined by bus links between stations (matrix-*-bus.json).
const matrices = new Map<string, Promise<Matrix>>([["am", loadJson<Matrix>("matrix.json")]]);
const getMatrix = (when: When, buses: boolean) => {
  const key = buses ? `${when}-bus` : when;
  if (!matrices.has(key)) matrices.set(key, loadJson<Matrix>(`matrix${WHEN[when].suffix}${buses ? "-bus" : ""}.json`));
  return matrices.get(key)!;
};
const feeders = new Map<When, Promise<FeederStop[]>>();
const getFeeder = (when: When) => {
  if (!feeders.has(when)) feeders.set(when, loadJson<FeederStop[]>(`feeder${WHEN[when].suffix}.json`));
  return feeders.get(when)!;
};
const finders = new Map<string, Promise<RouteFinder>>();
const getFinder = (when: When, buses: boolean, stationCount: number) => {
  const key = buses ? `${when}-bus` : when;
  if (!finders.has(key)) {
    finders.set(key, loadJson<Graph>(`graph${WHEN[when].suffix}.json`).then((g) => new RouteFinder(g, stationCount, buses)));
  }
  return finders.get(key)!;
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
  let measure: Measure = initial.get("m") === "avg" ? "average" : "worst";
  /** Trips a week to A and to B, used by the "Average trip" measure. */
  const weights = (initial.get("w") ?? "5,5").split(",").map((x) => Math.min(14, Math.max(0, Math.round(Number(x)) || 0)));
  while (weights.length < 2) weights.push(5);
  /** Bus stops with a bus route to a station, for the chosen time of day; empty unless the bus option is on. */
  let feeder: FeederStop[] = access.id === "bus" ? await getFeeder(when) : [];
  let hexes = buildHexes(stations, access, feeder);
  let hexIndex = new Map(hexes.map((h, i) => [h.id, i]));
  basemap.init();
  const noteFallback = () => {
    if (usingFallbackStyle) {
      statusEl.textContent += ` ${t("base.fallback")}`;
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
  let pickTarget: "dest" | "cand" = "dest";
  let mode: "commute" | "network" = "commute";

  /** Places the visitor is considering living in, kept in the link. */
  interface Candidate {
    lat: number;
    lng: number;
    label: string;
  }
  const MAX_CANDIDATES = 6;
  const candidates: Candidate[] = [];
  const candMarkers: maplibregl.Marker[] = [];
  let meta: Meta | null = null;

  const PIN_COLORS = ["#c0392b", "#6c3fc5"];
  const slotName = (i: number) => (i === 0 ? "A" : "B");
  const shortLabel = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);
  const markers = PIN_COLORS.map((color, i) => {
    const m = new maplibregl.Marker({ color, draggable: true });
    const label = document.createElement("span");
    label.className = "pin-label";
    label.textContent = t("pin.label");
    m.getElement().appendChild(label);
    m.getElement().title = t("pin.drag");
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
    return t("pin.near", { station: stations[best].name });
  }

  function setPicking(on: boolean, target: "dest" | "cand" = "dest") {
    picking = on;
    pickTarget = target;
    const forDest = on && target === "dest";
    const forCand = on && target === "cand";
    el("pick").classList.toggle("on", forDest);
    el("pick").textContent = forDest ? t("pick.cancel") : t("pick.default");
    el("cand-pick").classList.toggle("on", forCand);
    el("cand-pick").textContent = forCand ? t("cand.pick.cancel") : t("cand.pick");
    document.body.classList.toggle("picking", on);
    if (on) {
      statusEl.textContent = t(forCand ? "pick.status.cand" : "pick.status.dest");
      if (isPhone()) setCollapsed(true);
    }
  }

  // ---- Shortlist: places you are considering, each with its commute ---------------------------------
  const bandDot = (minutes: number) => `<i style="background:${BAND_COLORS[bandOf(minutes)]}"></i>`;
  const minutesLabel = (m: number) => (Number.isFinite(m) ? t("min", { n: Math.round(m) }) : t("no.route"));

  function renderCandidates() {
    candMarkers.forEach((m) => m.remove());
    candMarkers.length = 0;
    const list = el("cand-list");
    const used = [0, 1].filter((i) => results[i]);
    list.innerHTML = candidates
      .map((c, k) => {
        const near = stationsNear(stations, c.lat, c.lng, access, feeder);
        const each = used.map((i) => commuteFrom(near, results[i]!, reverse).minutes);
        const total = each.length ? combineValues(each, measure, used.map((i) => weights[i])) : Infinity;
        const detail = used.length === 2 ? `<span class="cand-times">A ${minutesLabel(each[0])} · B ${minutesLabel(each[1])}</span>` : "";
        return (
          `<li class="cand"><span class="cand-n">${k + 1}</span>` +
          `<span class="cand-main"><span class="cand-name" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</span>${detail}</span>` +
          `<span class="cand-total">${bandDot(total)}${minutesLabel(total)}</span>` +
          `<button type="button" class="cand-remove" data-remove="${k}" aria-label="${escapeHtml(t("cand.remove.aria", { name: c.label }))}">×</button></li>`
        );
      })
      .join("");
    list.querySelectorAll<HTMLElement>(".cand").forEach((row, k) => {
      row.addEventListener("click", (ev) => {
        if ((ev.target as HTMLElement).closest(".cand-remove")) return;
        map.flyTo({ center: [candidates[k].lng, candidates[k].lat], zoom: Math.max(map.getZoom(), 12.5) });
      });
    });
    list.querySelectorAll<HTMLButtonElement>(".cand-remove").forEach((b) => {
      b.addEventListener("click", () => {
        candidates.splice(Number(b.dataset.remove), 1);
        renderCandidates();
        writeHash();
      });
    });
    if (mode === "commute") {
      candidates.forEach((c, k) => {
        const pin = document.createElement("div");
        pin.className = "cand-pin";
        pin.textContent = String(k + 1);
        pin.title = c.label;
        candMarkers.push(new maplibregl.Marker({ element: pin }).setLngLat([c.lng, c.lat]).addTo(map));
      });
    }
  }

  function addCandidate(c: Candidate) {
    if (candidates.length >= MAX_CANDIDATES) {
      statusEl.textContent = t("cand.max", { n: MAX_CANDIDATES });
      return;
    }
    candidates.push({ ...c, label: c.label.replace(/[,|]/g, " ").slice(0, 60) });
    renderCandidates();
    writeHash();
  }

  // ---- Ranking: the stations with the shortest commute, as a list ----------------------------------
  function renderRanking() {
    const used = [0, 1].filter((i) => results[i]);
    const list = el("rank-list");
    if (!used.length) {
      list.innerHTML = "";
      return;
    }
    const rows = stations
      .map((s, i) => ({ s, i, minutes: combineValues(used.map((k) => results[k]!.stationTimes[i]), measure, used.map((k) => weights[k])) }))
      .filter((r) => Number.isFinite(r.minutes) && r.minutes > 3)
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 8);
    const dir = t(reverse ? "dir.from.word" : "dir.to.word");
    el("rank-note").textContent =
      used.length === 2
        ? t("rank.note.two", { measure: t(measure === "average" ? "rank.measure.average" : "rank.measure.worst"), dir })
        : t("rank.note.one", { dir });
    list.innerHTML = rows
      .map(
        (r) =>
          `<li><button type="button" class="rank" data-station="${r.i}"><span class="rank-name">${escapeHtml(r.s.name)}</span>` +
          `<span class="rank-lines">${escapeHtml(r.s.lines.slice(0, 3).join(" · "))}</span>` +
          `<span class="rank-total">${bandDot(r.minutes)}${t("min", { n: Math.round(r.minutes) })}</span></button></li>`,
      )
      .join("");
    list.querySelectorAll<HTMLButtonElement>(".rank").forEach((b) => {
      b.addEventListener("click", () => {
        const s = stations[Number(b.dataset.station)];
        map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 12.5) });
        if (isPhone()) setCollapsed(true);
      });
    });
  }

  /** The data note under the panel: when it was built, bus feed freshness, and expiry warnings. */
  function renderDataInfo() {
    if (!meta) return;
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const expired = Object.values(meta.feeds).some((f) => f.valid_to && f.valid_to < today);
    let text = t("data.built", { date: prettyDate(meta.built) });
    if (expired) text += ` ${t("data.expired")}`;
    if (access.id === "bus") {
      const f = meta.feeds.feeder?.valid_to;
      const c = meta.feeds.city?.valid_to;
      text += ` ${t("data.bus")}` + (f && c ? ` ${t("data.bus.valid", { f: prettyDate(f), c: prettyDate(c) })}` : "");
    }
    el("data-info").textContent = text;
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
    if (b && measure === "average") {
      p.set("m", "avg");
      p.set("w", weights.join(","));
    }
    if (lang !== "en") p.set("lang", lang);
    if (candidates.length) p.set("h", candidates.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${c.label}`).join("|"));
    history.replaceState(null, "", `#${p.toString().replaceAll("%2C", ",")}`);
  }

  function showAccess() {
    document.querySelectorAll<HTMLButtonElement>("#access button").forEach((b) => {
      const on = b.dataset.access === access.id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    el("access").style.setProperty("--i", String(["walk", "bus", "ride"].indexOf(access.id)));
    renderDataInfo();
    el("access-note").textContent =
      t(access.id === "walk" ? "access.note.walk" : access.id === "bus" ? "access.note.bus" : "access.note.ride");
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
    el("when-note").textContent = t(reverse ? "when.note.from" : "when.note.to", { hours: WHEN[when].hours });
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

  /** The grid depends on how you reach a station (and, for buses, on the time of day). */
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
    second.textContent = t(dests[1] ? "slot.b" : "slot.b.add");
    const d = dests[slot];
    el("slot-note").textContent = d
      ? t("slot.note.set", { slot: slotName(slot), label: d.label })
      : t(slot === 1 ? "slot.note.b" : "slot.note.a");
    el("remove-b").hidden = !(slot === 1 && dests[1]);
  }

  /** The "Longer trip / Average trip" choice shows only when there are two destinations. */
  function showMeasure() {
    const two = !!(dests[0] && dests[1]);
    el("measure-box").hidden = !two;
    document.querySelectorAll<HTMLButtonElement>("#measure button").forEach((b) => {
      const on = b.dataset.measure === (measure === "average" ? "average" : "worst");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    el("measure").style.setProperty("--i", measure === "average" ? "1" : "0");
    el("weights").hidden = measure !== "average";
    el<HTMLInputElement>("weight-a").value = String(weights[0]);
    el<HTMLInputElement>("weight-b").value = String(weights[1]);
    el("measure-note").textContent =
      t(measure === "worst" ? "measure.note.worst" : "measure.note.average");
  }

  function setSlot(next: number) {
    slot = next;
    setPicking(false);
    showSlots();
    document.querySelectorAll<HTMLButtonElement>("#chips button").forEach((b) => {
      b.classList.toggle("on", b.dataset.chip === dests[slot]?.chip);
    });
    if (slot === 1 && !dests[1]) statusEl.textContent = t("slot.status.b");
  }

  async function update() {
    if (!dests.some(Boolean)) return;
    breakdownPopup.remove();
    const matrix = await getMatrix(when, access.id === "bus");
    const started = performance.now();
    dests.forEach((d, i) => {
      results[i] = d ? compute(stations, matrix, hexes, d.lat, d.lng, access, reverse, feeder) : null;
    });
    const active = results.filter((r): r is Result => r !== null);
    const times = active.length === 2 ? combine(active, measure, weights) : active[0].hexTimes;
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
      markers[i].getElement().querySelector(".pin-label")!.textContent = compare ? `${slotName(i)}: ${shortLabel(d.label)}` : t("pin.label");
    });
    const names = dests.filter((d): d is Destination => d !== null).map((d) => d.label).join(` ${t("names.and")} `);
    const dir = t(reverse ? "dir.from.word" : "dir.to.word");
    summaryEl.textContent = t(compare ? (measure === "average" ? "sum.average" : "sum.worst") : "sum.single", {
      dir,
      names,
      when: WHEN[when].label,
    });
    el("legend-title").textContent = compare
      ? t(measure === "average" ? "legend.average" : "legend.worst", { dir, names })
      : t(reverse ? "legend.from" : "legend.to", { names });
    showSlots();
    showMeasure();
    document.querySelectorAll<HTMLButtonElement>("#chips button").forEach((b) => {
      b.classList.toggle("on", b.dataset.chip === dests[slot]?.chip);
    });
    peekEl.textContent = PEEK_TIP;
    const stranded = dests.flatMap((d, i) => (d && !results[i]!.destStations.length ? [slotName(i)] : []));
    statusEl.textContent = stranded.length
      ? t("status.stranded", { reach: t(`reach.${access.id}` as Key), which: stranded.join(` ${t("or")} `) })
      : t(compare ? "status.tap.two" : "status.tap.one");
    renderCandidates();
    renderRanking();
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
    const busWords = (route: string | undefined, boarding: boolean) => {
      if (!route) return undefined;
      const many = route.includes(" > ");
      const r = route.replaceAll(" > ", t("bus.sep"));
      return t(boarding ? (many ? "bus.board.many" : "bus.board.one") : many ? "bus.alight.many" : "bus.alight.one", { r });
    };
    const hexVia = busWords(reverse ? (hexLeg.viaBack ?? hexLeg.via) : hexLeg.via, !reverse);
    const destVia = busWords(destLeg.via, reverse);
    const finder = await getFinder(when, access.id === "bus", stations.length);
    const route = reverse ? finder.route(alight, board) : finder.route(board, alight);
    if (!route) return null;
    const html = breakdownHtml({
      walkToStation: reverse
        ? { name: stations[alight].name, minutes: walkOut, via: destVia }
        : { name: stations[board].name, minutes: walkIn, via: hexVia },
      route,
      stationName: (k) => stations[k].name,
      walkToDestination: reverse
        ? { name: t("trip.here"), minutes: walkIn, via: hexVia }
        : { name: dest.label, minutes: walkOut, via: destVia },
      total: time,
      verb: t(access.id === "ride" ? "verb.ride" : "verb.walk"),
    });
    return { html, time };
  }

  async function showBreakdown(hexIdx: number, at: maplibregl.LngLatLike) {
    const used = [0, 1].filter((i) => dests[i] && results[i]);
    if (!used.length) return;
    const trips = await Promise.all(used.map((i) => tripFor(i, hexIdx)));
    const phrase = (i: number) => t(reverse ? "trip.from" : "trip.to", { label: escapeHtml(dests[i]!.label) });
    let body: string;
    if (used.length === 1) {
      const trip = trips[0];
      body = trip
        ? `<strong>${t("min", { n: Math.round(trip.time) })} ${phrase(used[0])}</strong>${trip.html}`
        : `<strong>${t("trip.noroute")}</strong><br>${t("trip.noroute.body")}`;
    } else {
      const times = trips.map((trip) => trip?.time ?? Infinity);
      const worst = Math.max(...times);
      const w = weights.every((x) => x <= 0) ? [1, 1] : weights;
      const average = used.reduce((sum, i, k) => (w[i] > 0 ? sum + w[i] * times[k] : sum), 0) / used.reduce((sum, i) => sum + Math.max(0, w[i]), 0);
      const headline = measure === "average" ? average : worst;
      body = Number.isFinite(headline)
        ? `<strong>${t(measure === "average" ? "trip.average" : "trip.slower", { n: Math.round(headline) })}</strong>`
        : `<strong>${t("trip.noroute")}</strong> ${t("trip.noroute.one")}`;
      body += used
        .map((i, k) => {
          const trip = trips[k];
          const badge = `<span class="slot-badge" style="background:${PIN_COLORS[i]}">${slotName(i)}</span>`;
          return trip
            ? `<div class="trip-head">${badge}${t("min", { n: Math.round(trip.time) })} ${phrase(i)}</div>${trip.html}`
            : `<div class="trip-head">${badge}${phrase(i)}</div><p class="small">${t("trip.noroute.body")}</p>`;
        })
        .join("");
    }
    const useLabel = dests[1] || slot === 1 ? t("popup.use.slot", { slot: slotName(slot) }) : t("popup.use.my");
    breakdownPopup
      .setLngLat(at)
      .setHTML(
        `${body}<div class="popup-note">${t("popup.note", { hours: WHEN[when].hours })}</div>` +
          `<div class="popup-actions"><button type="button" id="set-dest">${useLabel}</button></div>`,
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
      const spot = { lng: e.lngLat.lng, lat: e.lngLat.lat, label: nearestLabel(e.lngLat.lng, e.lngLat.lat) };
      if (pickTarget === "cand") {
        setPicking(false);
        addCandidate(spot);
      } else {
        void setDestination(spot);
      }
      return;
    }
    if (!dests.some(Boolean)) return;
    const hit = map.queryRenderedFeatures(e.point, { layers: ["hex-fill"] })[0];
    const idx = hit ? hexIndex.get(hit.properties.id as string) : undefined;
    if (idx !== undefined) {
      void showBreakdown(idx, e.lngLat);
    } else {
      statusEl.textContent = t("status.nohit");
      if (isPhone()) setCollapsed(false);
    }
  });
  el("pick").addEventListener("click", () => setPicking(!(picking && pickTarget === "dest"), "dest"));
  el("cand-pick").addEventListener("click", () => setPicking(!(picking && pickTarget === "cand"), "cand"));
  el<HTMLFormElement>("cand-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = el<HTMLInputElement>("cand-input");
    const q = input.value.trim();
    if (!q) return;
    statusEl.textContent = t("status.searching");
    try {
      const hit = await geocode(q);
      if (!hit) {
        statusEl.textContent = t("status.nomatch", { q });
        return;
      }
      addCandidate(hit);
      input.value = "";
      statusEl.textContent = t("cand.added", { label: hit.label });
    } catch {
      statusEl.textContent = t("cand.down");
    }
  });
  document.querySelectorAll<HTMLButtonElement>("#slots button").forEach((b) => {
    b.addEventListener("click", () => setSlot(Number(b.dataset.slot)));
  });
  document.querySelectorAll<HTMLButtonElement>("#measure button").forEach((b) => {
    b.addEventListener("click", () => {
      const next: Measure = b.dataset.measure === "average" ? "average" : "worst";
      if (next === measure) return;
      measure = next;
      void update();
    });
  });
  (["weight-a", "weight-b"] as const).forEach((id, k) => {
    el<HTMLInputElement>(id).addEventListener("change", (ev) => {
      const v = Math.round(Number((ev.target as HTMLInputElement).value));
      weights[k] = Math.min(14, Math.max(0, Number.isFinite(v) ? v : 0));
      void update();
    });
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
    statusEl.textContent = t("status.searching");
    try {
      const hit = await geocode(q);
      if (!hit) {
        statusEl.textContent = t("status.nomatch", { q });
        return;
      }
      map.flyTo({ center: [hit.lng, hit.lat], zoom: Math.max(map.getZoom(), 12) });
      await setDestination(hit);
    } catch {
      statusEl.textContent = t("status.searchdown");
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
      btn.textContent = t("share.done");
    } catch {
      statusEl.textContent = t("share.fail");
    }
    setTimeout(() => (btn.textContent = t("share.button")), 1800);
  });

  // "Data as of": when the timetable was built, and a warning if a feed has expired.
  void loadJson<Meta>("meta.json")
    .then((m) => {
      meta = m;
      renderDataInfo();
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
      candMarkers.forEach((m) => m.remove());
      map.setLayoutProperty("hex-fill", "visibility", "none");
      statusEl.textContent = "";
      if (isPhone()) setCollapsed(true);
      try {
        await netView.enter();
      } catch (err) {
        statusEl.textContent = t("net.err");
        console.error(err);
      }
    } else {
      netView.leave();
      map.setLayoutProperty("hex-fill", "visibility", "visible");
      summaryEl.textContent = t("app.loading");
      await update();
    }
  }
  document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((b) => {
    b.addEventListener("click", () => void setMode(b.dataset.mode as "commute" | "network"));
  });

  // A shared link opens straight onto its destination.
  const hash = new URLSearchParams(location.hash.slice(1));
  for (const part of (hash.get("h") ?? "").split("|").slice(0, MAX_CANDIDATES)) {
    const [lat, lng, ...name] = part.split(",");
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && inValley(Number(lat), Number(lng))) {
      candidates.push({ lat: Number(lat), lng: Number(lng), label: name.join(" ").slice(0, 60) || "Place" });
    }
  }
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
  statusEl.textContent = t("status.example");
  noteFallback();
}

start().catch((err) => {
  summaryEl.textContent = t("err.title");
  statusEl.textContent = t("err.start", { msg: err.message });
  console.error(err);
});
