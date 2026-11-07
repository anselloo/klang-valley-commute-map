import * as maplibregl from "maplibre-gl";
import { escapeHtml } from "./breakdown";
import { lineLabel, modeLabel, t as tr } from "./i18n";
import { readableText } from "./color";
import { DAY, formatClock, Network, type NetworkData, type Train } from "./network";
import type { Station } from "./types";

export interface NetworkHooks {
  /** Switch to the commute map with this station as the destination. */
  useAsDestination(station: number): void;
  isPhone(): boolean;
}

const START_OF_SERVICE = 18000; // 05:00, the slider's left edge
const END_OF_SERVICE = 90000; // 01:00 the next day
const FRAME_MS = 33; // about 30 updates a second is plenty for 200 small markers
const REVEAL_MS = 1500;

const ICON_PAUSE = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="4.5" y="3.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="11.5" y="3.5" width="4" height="13" rx="1.2" fill="currentColor"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 3.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.3 0-1.7L7.6 2.9C6.9 2.5 6 3 6 3.8z" fill="currentColor"/></svg>`;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Short code for a line's badge: the line's own name when short (KJL), otherwise "KTM". */
const lineCode = (name: string, code?: string) => code ?? (name.length <= 4 ? name : "KTM");
/** The wording that goes next to the badge when the badge alone does not name the line. */
const lineSuffix = (name: string) => (name.length <= 4 ? "" : `${escapeHtml(lineLabel(name))} `);
const badge = (name: string, color: string, code?: string) =>
  `<span class="badge" style="background:${color};color:${readableText(color)}">${escapeHtml(lineCode(name, code))}</span>`;
const minutesText = (seconds: number) =>
  seconds < 30 ? tr("net.now") : seconds < 90 ? tr("net.min1") : tr("min", { n: Math.round(seconds / 60) });
/** When something happens, as it reads in a sentence: "now" or "in 3 min" ("3 min lagi"). */
const untilText = (seconds: number) => (seconds < 30 ? tr("net.now") : tr("net.in", { when: minutesText(seconds) }));

/**
 * A round, Apple-Maps-style puck in the line's colour: white ring, soft shadow and a small rounded
 * pointer on top that shows the direction of travel.
 */
function arrowImage(color: string): ImageData {
  const size = 48;
  const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // White body: disc plus a rounded pointer, drawn with a shadow.
  const body = () => {
    ctx.beginPath();
    ctx.arc(c, c + 3, 13, 0, Math.PI * 2);
    ctx.moveTo(c - 7, c - 6);
    ctx.lineTo(c, 5);
    ctx.lineTo(c + 7, c - 6);
    ctx.closePath();
  };
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  body();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "transparent";

  // Coloured centre.
  ctx.beginPath();
  ctx.arc(c, c + 3, 9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Small white chevron inside, also pointing up.
  ctx.beginPath();
  ctx.moveTo(c - 4, c + 6);
  ctx.lineTo(c, c);
  ctx.lineTo(c + 4, c + 6);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.4;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

const NET_NOTE = tr("net.note");

/** Seconds since midnight in Kuala Lumpur, whatever timezone the visitor's device is in. */
function malaysiaNow(): { seconds: number; weekend: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hourCycle: "h23",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const day = get("weekday");
  return { seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second")), weekend: day === "Sat" || day === "Sun" };
}

export class NetworkView {
  private net: Network | null = null;
  private loading: Promise<void> | null = null;
  private layersAdded = false;
  private active = false;

  private simTime = 27000; // 07:30
  private playing = true;
  private speed = 60;
  private lastFrame = 0;
  private lastPush = 0;
  private lastUi = 0;
  private raf = 0;
  private revealStart = 0;
  private revealDone = false;

  private focusLine: number | null = null;
  private followTrip: number | null = null;
  private following = false;
  private selectedStation: number | null = null;
  private pulseStart = 0;
  private trains: Train[] = [];
  private cardHtml = "";

  constructor(
    private readonly map: maplibregl.Map,
    private readonly stations: Station[],
    private readonly hooks: NetworkHooks,
  ) {
    this.bindControls();
  }

  /** Show the network view and start the animation. */
  async enter() {
    this.active = true;
    await this.load();
    if (!this.active) return;
    this.setVisibility("visible");
    this.revealStart = performance.now();
    this.revealDone = false;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.updateUi(true);
  }

  /** Hide the network view and stop animating. */
  leave() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.following = false;
    this.followTrip = null;
    if (this.layersAdded) this.setVisibility("none");
  }

  // ---- Loading and layers --------------------------------------------------------------------

  private load(): Promise<void> {
    this.loading ??= (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/network.json`);
      if (!res.ok) throw new Error(`Failed to load network.json: ${res.status}`);
      const data = (await res.json()) as NetworkData;
      this.net = new Network(data, this.stations);
      this.addLayers();
      this.buildLineList();
    })();
    return this.loading;
  }

  private addLayers() {
    const { map } = this;
    const net = this.net!;
    net.lines.forEach((line, i) => map.addImage(`train-${i}`, arrowImage(line.color), { pixelRatio: 2 }));

    map.addSource("net-lines", {
      type: "geojson",
      lineMetrics: true, // needed for the draw-in animation
      data: {
        type: "FeatureCollection",
        features: net.lines.map((l, i) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: net.lineCoordinates(i) },
          properties: { line: i, color: l.color },
        })),
      },
    });
    const before = "station-dots"; // keep lines under the station dots
    map.addLayer(
      {
        id: "net-casing",
        type: "line",
        source: "net-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 10],
        },
      },
      before,
    );
    net.lines.forEach((l, i) => {
      map.addLayer(
        {
          id: `net-line-${i}`,
          type: "line",
          source: "net-lines",
          filter: ["==", ["get", "line"], i],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
            "line-gradient": ["step", ["line-progress"], l.color, 0.0001, "rgba(0,0,0,0)"],
            "line-opacity": 1,
          },
        },
        before,
      );
    });

    map.addSource("net-pulse", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "net-pulse",
      type: "circle",
      source: "net-pulse",
      paint: {
        "circle-radius": 14,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#c0392b",
        "circle-stroke-width": 3,
        "circle-stroke-opacity": 0.8,
        "circle-pitch-alignment": "map",
      },
    });

    map.addSource("net-trains", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "net-follow-ring",
      type: "circle",
      source: "net-trains",
      filter: ["==", ["get", "trip"], -1],
      paint: {
        "circle-radius": 17,
        "circle-color": "rgba(255,255,255,0.35)",
        "circle-stroke-color": "#1d2733",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "net-trains",
      type: "symbol",
      source: "net-trains",
      layout: {
        "icon-image": ["concat", "train-", ["get", "line"]],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          9, ["case", ["==", ["get", "stopped"], 1], 0.4, 0.5],
          11, ["case", ["==", ["get", "stopped"], 1], 0.65, 0.85],
          14, ["case", ["==", ["get", "stopped"], 1], 1.1, 1.4],
        ],
      },
    });
    this.layersAdded = true;
  }

  private layerIds(): string[] {
    const net = this.net!;
    return ["net-casing", ...net.lines.map((_, i) => `net-line-${i}`), "net-pulse", "net-follow-ring", "net-trains"];
  }

  private setVisibility(v: "visible" | "none") {
    if (!this.layersAdded) return;
    for (const id of this.layerIds()) this.map.setLayoutProperty(id, "visibility", v);
  }

  // ---- Controls ------------------------------------------------------------------------------

  private bindControls() {
    const slider = el<HTMLInputElement>("net-slider");
    slider.min = String(START_OF_SERVICE);
    slider.max = String(END_OF_SERVICE);
    slider.addEventListener("input", () => {
      this.simTime = Number(slider.value);
      this.pushFrame(true);
      this.updateUi(true);
    });
    el("net-play").addEventListener("click", () => this.setPlaying(!this.playing));
    el("head-play").addEventListener("click", () => this.setPlaying(!this.playing));
    const speedButtons = [...document.querySelectorAll<HTMLButtonElement>("#net-speed button")];
    const showSpeed = (b: HTMLButtonElement) => {
      this.speed = Number(b.dataset.speed);
      speedButtons.forEach((o) => o.classList.toggle("on", o === b));
      el("net-speed").style.setProperty("--i", String(speedButtons.indexOf(b)));
    };
    speedButtons.forEach((b) => b.addEventListener("click", () => showSpeed(b)));
    showSpeed(speedButtons.find((b) => b.classList.contains("on")) ?? speedButtons[0]);
    this.setPlaying(true);
    document.querySelectorAll<HTMLButtonElement>("#net-jumps button[data-time]").forEach((b) => {
      b.addEventListener("click", () => this.jumpTo(Number(b.dataset.time)));
    });
    el("net-now").addEventListener("click", () => {
      const { seconds, weekend } = malaysiaNow();
      this.jumpTo(seconds);
      el("net-note").textContent = weekend ? `${NET_NOTE} ${tr("net.weekend")}` : NET_NOTE;
    });
    this.map.on("dragstart", () => {
      this.following = false;
    });
  }

  private setPlaying(on: boolean) {
    this.playing = on;
    el("net-play").innerHTML = `${on ? ICON_PAUSE : ICON_PLAY}<span>${on ? tr("net.pause") : tr("net.play")}</span>`;
    el("net-play").setAttribute("aria-label", on ? tr("net.pause.aria") : tr("net.play.aria"));
    el("head-play").innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    el("head-play").setAttribute("aria-label", on ? tr("net.pause.aria") : tr("net.play.aria"));
    this.lastFrame = performance.now();
  }

  private jumpTo(seconds: number) {
    let t = seconds;
    if (t < START_OF_SERVICE) t += DAY; // after midnight counts as the end of the service day
    this.simTime = Math.min(END_OF_SERVICE - 1, Math.max(START_OF_SERVICE, t));
    this.pushFrame(true);
    this.updateUi(true);
  }

  private buildLineList() {
    const net = this.net!;
    const list = el("net-lines");
    list.innerHTML = net.lines
      .map(
        (l, i) =>
          `<li><button type="button" class="line-row" data-line="${i}">` +
          badge(l.name, l.color, l.code) +
          `<span class="line-name">${escapeHtml(lineLabel(l.mode === "KTM Komuter" || l.mode === "Airport rail" ? l.name : l.longName))} <span class="small">${escapeHtml(modeLabel(l.mode))}</span></span>` +
          `<span class="line-count" id="line-count-${i}"></span></button></li>`,
      )
      .join("");
    list.querySelectorAll<HTMLButtonElement>("button.line-row").forEach((b) => {
      b.addEventListener("click", () => this.setFocus(this.focusLine === Number(b.dataset.line) ? null : Number(b.dataset.line)));
    });
  }

  private setFocus(line: number | null) {
    this.focusLine = line;
    const net = this.net!;
    net.lines.forEach((_, i) => {
      this.map.setPaintProperty(`net-line-${i}`, "line-opacity", line === null || line === i ? 1 : 0.12);
    });
    this.map.setPaintProperty("net-casing", "line-opacity", line === null ? 0.85 : 0.4);
    this.map.setFilter("net-trains", line === null ? null : ["==", ["get", "line"], line]);
    document.querySelectorAll<HTMLButtonElement>("button.line-row").forEach((b) => {
      b.classList.toggle("on", Number(b.dataset.line) === line);
    });
    if (this.followTrip !== null && line !== null && this.trains.find((t) => t.trip === this.followTrip)?.line !== line) {
      this.stopFollowing();
    }
    this.pushFrame(true);
  }

  // ---- Map interaction (called from main's click handler) ------------------------------------

  /** Handle a click in network mode. Returns true if something was selected. */
  handleClick(point: maplibregl.Point): boolean {
    if (!this.layersAdded) return false;
    const pad = this.hooks.isPhone() ? 18 : 10;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - pad, point.y - pad],
      [point.x + pad, point.y + pad],
    ];
    // A train stopped at a station sits right on top of its dot, so there the station should win a
    // close call. A moving train is a deliberate target (they also crawl out of stations, so they are
    // often within a few pixels of a dot): it gets a small edge in close calls.
    const STOPPED_PENALTY_PX = 8;
    const MOVING_BONUS_PX = 4;
    const distance = (f: maplibregl.MapGeoJSONFeature) => {
      const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      const p = this.map.project([lon, lat]);
      return Math.hypot(p.x - point.x, p.y - point.y);
    };
    const nearest = (layer: string, penalty: (f: maplibregl.MapGeoJSONFeature) => number) => {
      const feats = this.map.queryRenderedFeatures(box, { layers: [layer] });
      return feats.map((f) => ({ f, d: distance(f) + penalty(f) })).sort((x, y) => x.d - y.d)[0];
    };
    const train = nearest("net-trains", (f) => (f.properties.stopped === 1 ? STOPPED_PENALTY_PX : -MOVING_BONUS_PX));
    const station = nearest("station-dots", () => 0);
    if (train && (!station || train.d < station.d)) {
      this.selectStation(null);
      this.followTripNow(Number(train.f.properties.trip));
      return true;
    }
    if (station) {
      this.stopFollowing();
      this.selectStation(Number(station.f.properties.i));
      return true;
    }
    const line = this.map.queryRenderedFeatures(box, { layers: this.net!.lines.map((_, i) => `net-line-${i}`) })[0];
    if (line) {
      this.setFocus(Number(line.properties.line));
      return true;
    }
    this.stopFollowing();
    this.selectStation(null);
    return false;
  }

  private followTripNow(trip: number) {
    this.followTrip = trip;
    this.following = true;
    this.map.setFilter("net-follow-ring", ["==", ["get", "trip"], trip]);
    this.updateUi(true);
  }

  private stopFollowing() {
    this.followTrip = null;
    this.following = false;
    if (this.layersAdded) this.map.setFilter("net-follow-ring", ["==", ["get", "trip"], -1]);
    this.updateUi(true);
  }

  private selectStation(index: number | null) {
    this.selectedStation = index;
    this.pulseStart = performance.now();
    const src = this.map.getSource("net-pulse") as maplibregl.GeoJSONSource;
    src.setData({
      type: "FeatureCollection",
      features:
        index === null
          ? []
          : [{ type: "Feature", geometry: { type: "Point", coordinates: [this.stations[index].lon, this.stations[index].lat] }, properties: {} }],
    });
    this.updateUi(true);
  }

  // ---- Animation loop ------------------------------------------------------------------------

  private frame(now: number) {
    if (!this.active) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.playing) {
      this.simTime += dt * this.speed;
      if (this.simTime >= END_OF_SERVICE) this.simTime = START_OF_SERVICE + (this.simTime - END_OF_SERVICE);
    }
    this.animateReveal(now);
    this.animatePulse(now);
    if (now - this.lastPush >= FRAME_MS) {
      this.lastPush = now;
      this.pushFrame(false);
    }
    if (now - this.lastUi >= 250) {
      this.lastUi = now;
      this.updateUi(false);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Draw each line in from its start, staggered, when the view opens. */
  private animateReveal(now: number) {
    if (this.revealDone) return;
    const net = this.net!;
    const elapsed = now - this.revealStart;
    let allDone = true;
    net.lines.forEach((l, i) => {
      const p = Math.min(1, Math.max(0, (elapsed - i * 90) / (REVEAL_MS - 900)));
      const eased = 1 - (1 - p) ** 3;
      if (p < 1) allDone = false;
      const stop = p >= 1 ? 1.01 : Math.max(0.0001, eased);
      this.map.setPaintProperty(`net-line-${i}`, "line-gradient", ["step", ["line-progress"], l.color, stop, "rgba(0,0,0,0)"]);
    });
    if (allDone) this.revealDone = true;
  }

  private animatePulse(now: number) {
    if (this.selectedStation === null) return;
    const phase = ((now - this.pulseStart) % 1400) / 1400;
    this.map.setPaintProperty("net-pulse", "circle-radius", 8 + phase * 26);
    this.map.setPaintProperty("net-pulse", "circle-stroke-opacity", 0.9 * (1 - phase));
  }

  private pushFrame(force: boolean) {
    if (!this.net || !this.layersAdded) return;
    void force;
    const t = this.simTime % DAY;
    this.trains = this.net.trainsAt(t);
    const features = this.trains.map((tr) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [tr.lon, tr.lat] },
      properties: { trip: tr.trip, line: tr.line, bearing: tr.bearing, stopped: tr.stopped ? 1 : 0 },
    }));
    (this.map.getSource("net-trains") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
    if (this.following && this.followTrip !== null) {
      const tr = this.trains.find((x) => x.trip === this.followTrip);
      if (tr) {
        const c = this.map.getCenter();
        this.map.setCenter([c.lng + (tr.lon - c.lng) * 0.25, c.lat + (tr.lat - c.lat) * 0.25]);
      }
    }
  }

  // ---- Panel text ----------------------------------------------------------------------------

  private updateUi(force: boolean) {
    if (!this.net) return;
    void force;
    const net = this.net;
    const t = this.simTime % DAY;
    el("net-time").textContent = formatClock(this.simTime);
    const slider = el<HTMLInputElement>("net-slider");
    slider.value = String(this.simTime);
    slider.style.setProperty("--p", `${((this.simTime - START_OF_SERVICE) / (END_OF_SERVICE - START_OF_SERVICE)) * 100}%`);
    const counts = net.countByLine(t);
    const running = counts.reduce((a, b) => a + b, 0);
    el("net-count").textContent = running ? tr("net.count", { n: running }) : tr("net.count.none");
    el("summary").textContent = `${formatClock(this.simTime)} · ${tr("net.count", { n: running })}`;
    counts.forEach((n, i) => {
      const c = document.getElementById(`line-count-${i}`);
      if (c) c.textContent = n ? String(n) : "–";
    });

    const { html, bind, peek } = this.buildCard(t);
    if (html !== this.cardHtml) {
      this.cardHtml = html;
      el("net-card").innerHTML = html;
      bind();
    }
    el("peek").textContent = peek || tr("net.peek");
  }

  /** The selection card for the current time, and how to wire up its buttons. */
  private buildCard(t: number): { html: string; bind: () => void; peek: string } {
    const net = this.net!;
    const none = { html: `<p class="small">${tr("net.card.none")}</p>`, bind: () => {}, peek: "" };
    const followed = this.followTrip !== null ? this.trains.find((x) => x.trip === this.followTrip) : undefined;
    if (this.followTrip !== null && !followed) {
      this.followTrip = null;
      this.following = false;
      this.map.setFilter("net-follow-ring", ["==", ["get", "trip"], -1]);
      return { html: `<p class="small">${tr("net.finished")}</p>`, bind: () => {}, peek: tr("net.finished") };
    }
    if (followed) {
      const line = net.lines[followed.line];
      const stop = this.stations[net.patterns[followed.pattern].stops[followed.nextStop]];
      const dest = this.stations[followed.destination];
      const next = followed.stopped
        ? tr("net.stopped", { name: escapeHtml(stop.name) })
        : tr("net.next", { name: escapeHtml(stop.name), when: untilText(followed.secondsToNext) });
      return {
        peek: followed.stopped
          ? tr("net.peek.stopped", { line: lineLabel(line.name), dest: dest.name, name: stop.name })
          : tr("net.peek.next", { line: lineLabel(line.name), dest: dest.name, name: stop.name, when: untilText(followed.secondsToNext) }),
        html:
          `<div class="card"><div class="card-title">${badge(line.name, line.color, line.code)}` +
          `<span>${lineSuffix(line.name)}${tr("net.to", { name: escapeHtml(dest.name) })}</span></div>` +
          `<p>${next}</p>` +
          `<div class="card-actions"><button type="button" id="follow-toggle">${this.following ? tr("net.unfollow") : tr("net.follow")}</button>` +
          `<button type="button" id="follow-close">${tr("net.close")}</button></div></div>`,
        bind: () => {
          el("follow-toggle").addEventListener("click", () => {
            this.following = !this.following;
            this.updateUi(true);
          });
          el("follow-close").addEventListener("click", () => this.stopFollowing());
        },
      };
    }
    if (this.selectedStation !== null) {
      const index = this.selectedStation;
      const s = this.stations[index];
      const deps = net.departures(index, t, 40 * 60, 2).filter((d) => this.focusLine === null || d.line === this.focusLine);
      const rows = deps.length
        ? deps
            .slice(0, 8)
            .map(
              (d) =>
                `<li>${badge(net.lines[d.line].name, net.lines[d.line].color, net.lines[d.line].code)}` +
                `<span class="dep-text">${lineSuffix(net.lines[d.line].name)}${tr("net.to", { name: escapeHtml(this.stations[d.destination].name) })}</span>` +
                `<span class="dep-time">${minutesText(d.inSeconds)}</span></li>`,
            )
            .join("")
        : `<li class="small">${tr("net.deps.none")}</li>`;
      return {
        peek: deps.length
          ? `${s.name}: ${deps.slice(0, 3).map((d) => `${lineLabel(net.lines[d.line].name)} ${tr("net.to", { name: this.stations[d.destination].name })} ${untilText(d.inSeconds)}`).join(", ")}`
          : tr("net.peek.nodeps", { name: s.name }),
        html:
          `<div class="card"><div class="card-title"><strong>${escapeHtml(s.name)}</strong></div>` +
          `<p class="small">${tr("net.deps")}</p><ul class="departures">${rows}</ul>` +
          `<div class="card-actions"><button type="button" id="station-dest">${tr("net.usedest")}</button>` +
          `<button type="button" id="station-close">${tr("net.close")}</button></div></div>`,
        bind: () => {
          el("station-dest").addEventListener("click", () => this.hooks.useAsDestination(index));
          el("station-close").addEventListener("click", () => this.selectStation(null));
        },
      };
    }
    return none;
  }
}

