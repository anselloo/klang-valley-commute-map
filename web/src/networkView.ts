import * as maplibregl from "maplibre-gl";
import { escapeHtml } from "./breakdown";
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

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const minutesText = (seconds: number) =>
  seconds < 30 ? "now" : seconds < 90 ? "1 min" : `${Math.round(seconds / 60)} min`;

/** An arrow in the line's colour inside a white ring with a dark outline, so it reads on its own line. */
function arrowImage(color: string): ImageData {
  const size = 44;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const path = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(size / 2, inset);
    ctx.lineTo(size - inset - 1, size - inset);
    ctx.lineTo(size / 2, size - inset - 8);
    ctx.lineTo(inset + 1, size - inset);
    ctx.closePath();
  };
  ctx.lineJoin = "round";
  path(3);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1d2733";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  path(10);
  ctx.fillStyle = color;
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
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
    document.querySelectorAll<HTMLButtonElement>("#net-speed button").forEach((b) => {
      b.addEventListener("click", () => {
        this.speed = Number(b.dataset.speed);
        document.querySelectorAll<HTMLButtonElement>("#net-speed button").forEach((o) => o.classList.toggle("on", o === b));
      });
    });
    document.querySelectorAll<HTMLButtonElement>("#net-jumps button[data-time]").forEach((b) => {
      b.addEventListener("click", () => this.jumpTo(Number(b.dataset.time)));
    });
    el("net-now").addEventListener("click", () => {
      const d = new Date();
      this.jumpTo(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
    });
    this.map.on("dragstart", () => {
      this.following = false;
    });
  }

  private setPlaying(on: boolean) {
    this.playing = on;
    el("net-play").textContent = on ? "❚❚ Pause" : "▶ Play";
    el("net-play").setAttribute("aria-label", on ? "Pause trains" : "Play trains");
    el("head-play").textContent = on ? "❚❚" : "▶";
    el("head-play").setAttribute("aria-label", on ? "Pause trains" : "Play trains");
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
          `<span class="swatch" style="background:${l.color}"></span>` +
          `<span class="line-name"><strong>${escapeHtml(l.name)}</strong> <span class="small">${escapeHtml(l.mode)}</span></span>` +
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
    el<HTMLInputElement>("net-slider").value = String(this.simTime);
    const counts = net.countByLine(t);
    const running = counts.reduce((a, b) => a + b, 0);
    el("net-count").textContent = running ? `${running} trains running` : "No trains running yet";
    el("summary").textContent = `${formatClock(this.simTime)} · ${running} trains running`;
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
    el("peek").textContent = peek || "Tap a train to follow it, or a station for departures.";
  }

  /** The selection card for the current time, and how to wire up its buttons. */
  private buildCard(t: number): { html: string; bind: () => void; peek: string } {
    const net = this.net!;
    const none = { html: `<p class="small">Nothing selected. Tap a train or a station on the map.</p>`, bind: () => {}, peek: "" };
    const followed = this.followTrip !== null ? this.trains.find((x) => x.trip === this.followTrip) : undefined;
    if (this.followTrip !== null && !followed) {
      this.followTrip = null;
      this.following = false;
      this.map.setFilter("net-follow-ring", ["==", ["get", "trip"], -1]);
      return { html: `<p class="small">That trip has finished its run.</p>`, bind: () => {}, peek: "That trip has finished its run." };
    }
    if (followed) {
      const line = net.lines[followed.line];
      const stop = this.stations[net.patterns[followed.pattern].stops[followed.nextStop]];
      const dest = this.stations[followed.destination];
      const next = followed.stopped
        ? `Stopped at <strong>${escapeHtml(stop.name)}</strong>`
        : `Next: <strong>${escapeHtml(stop.name)}</strong> in ${minutesText(followed.secondsToNext)}`;
      return {
        peek: `${line.name} to ${dest.name}: ${followed.stopped ? `stopped at ${stop.name}` : `next ${stop.name} in ${minutesText(followed.secondsToNext)}`}`,
        html:
          `<div class="card"><div class="card-title"><span class="swatch" style="background:${line.color}"></span>` +
          `<strong>${escapeHtml(line.name)}</strong> to ${escapeHtml(dest.name)}</div>` +
          `<p>${next}</p>` +
          `<div class="card-actions"><button type="button" id="follow-toggle">${this.following ? "Stop following" : "Follow this train"}</button>` +
          `<button type="button" id="follow-close">Close</button></div></div>`,
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
                `<li><span class="swatch" style="background:${net.lines[d.line].color}"></span>` +
                `<span class="dep-text"><strong>${escapeHtml(net.lines[d.line].name)}</strong> to ${escapeHtml(this.stations[d.destination].name)}</span>` +
                `<span class="dep-time">${minutesText(d.inSeconds)}</span></li>`,
            )
            .join("")
        : `<li class="small">No departures in the next 40 minutes at this time of day.</li>`;
      return {
        peek: deps.length
          ? `${s.name}: ${deps.slice(0, 3).map((d) => `${net.lines[d.line].name} to ${this.stations[d.destination].name} ${minutesText(d.inSeconds)}`).join(", ")}`
          : `${s.name}: no departures in the next 40 minutes`,
        html:
          `<div class="card"><div class="card-title"><strong>${escapeHtml(s.name)}</strong></div>` +
          `<p class="small">Next departures</p><ul class="departures">${rows}</ul>` +
          `<div class="card-actions"><button type="button" id="station-dest">Use as my destination</button>` +
          `<button type="button" id="station-close">Close</button></div></div>`,
        bind: () => {
          el("station-dest").addEventListener("click", () => this.hooks.useAsDestination(index));
          el("station-close").addEventListener("click", () => this.selectStation(null));
        },
      };
    }
    return none;
  }
}

