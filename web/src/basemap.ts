import type * as maplibregl from "maplibre-gl";

/**
 * Two base maps on one MapLibre style, so switching never rebuilds the map and our own layers
 * (hexes, stations, trains) stay put:
 *   map        the OpenFreeMap "Bright" vector style, with its busy orange roads softened so the
 *              transit lines and travel-time colours stand out
 *   satellite  Esri World Imagery under the same vector place labels, recoloured to read on photos
 */
export type Basemap = "map" | "satellite";

export const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION =
  "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community";

const WATER = "#a9d4f2";
const GREEN = "#cde7bd";

/**
 * Paint overrides for one layer of the Bright style, or null to leave it alone. Pure, so it can be
 * tested without a map.
 */
export function colorTweaks(id: string, type: string): Record<string, unknown> | null {
  if (id === "background") return { "background-color": "#f5f2eb" };
  if (id === "water") return { "fill-color": WATER };
  if (id.startsWith("waterway")) return type === "line" ? { "line-color": WATER } : null;
  if (id === "park" || id === "landcover-grass" || id === "landcover-grass-park") return { "fill-color": GREEN };
  if (id === "landcover-wood") return { "fill-color": "#b7d9a3" };

  // Roads: soften the saturated oranges and keep minor roads white.
  const road = /^(highway|bridge|tunnel)-(motorway-link|motorway|trunk-primary|trunk|primary|secondary-tertiary|link)(-casing)?$/.exec(id);
  if (road && type === "line") {
    const [, , kind, casing] = road;
    const major = kind.startsWith("motorway");
    const mid = kind === "trunk" || kind === "primary" || kind === "trunk-primary";
    if (casing) return { "line-color": major ? "#e9c88c" : mid ? "#ead6ab" : "#e8ddc4" };
    return { "line-color": major ? "#fdd78f" : mid ? "#feebb8" : "#fff5d9" };
  }
  return null;
}

type TextPaint = { color: unknown; halo: unknown; width: unknown };

export class BasemapController {
  private baseLayers: { id: string; type: string; visibility: string }[] = [];
  private original = new Map<string, TextPaint>();
  private mode: Basemap = "map";
  /** Called after each switch, so the page can adapt the data overlays. */
  onChange: (mode: Basemap) => void = () => {};

  constructor(private readonly map: maplibregl.Map) {}

  /** Call once the style has loaded and before adding our own layers. */
  init() {
    const { map } = this;
    const layers = map.getStyle().layers;
    this.baseLayers = layers.map((l) => ({
      id: l.id,
      type: l.type,
      visibility: (l.layout as { visibility?: string } | undefined)?.visibility ?? "visible",
    }));
    for (const l of layers) {
      const tweak = colorTweaks(l.id, l.type);
      if (!tweak) continue;
      for (const [prop, value] of Object.entries(tweak)) {
        map.setPaintProperty(l.id, prop as never, value as never);
      }
    }
    map.addSource("satellite", {
      type: "raster",
      tiles: [SATELLITE_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: SATELLITE_ATTRIBUTION,
    });
    // Under the first label layer, so place names and road names draw on top of the imagery.
    const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
        layout: { visibility: "none" },
        paint: { "raster-fade-duration": 250 },
      },
      firstSymbol,
    );
  }

  get current(): Basemap {
    return this.mode;
  }

  /** Switch base map. Safe to call again after adding layers: labels added later are recoloured too. */
  set(mode: Basemap) {
    const { map } = this;
    this.mode = mode;
    const satellite = mode === "satellite";
    map.setLayoutProperty("satellite", "visibility", satellite ? "visible" : "none");
    for (const l of this.baseLayers) {
      if (l.type === "symbol") continue;
      map.setLayoutProperty(l.id, "visibility", (satellite ? "none" : l.visibility) as never);
    }
    // Labels: white with a dark halo over imagery, their own colours otherwise.
    for (const l of map.getStyle().layers) {
      if (l.type !== "symbol" || !(l.layout as { "text-field"?: unknown } | undefined)?.["text-field"]) continue;
      if (!this.original.has(l.id)) {
        this.original.set(l.id, {
          color: map.getPaintProperty(l.id, "text-color"),
          halo: map.getPaintProperty(l.id, "text-halo-color"),
          width: map.getPaintProperty(l.id, "text-halo-width"),
        });
      }
      const o = this.original.get(l.id)!;
      map.setPaintProperty(l.id, "text-color", (satellite ? "#ffffff" : o.color) as never);
      map.setPaintProperty(l.id, "text-halo-color", (satellite ? "rgba(0,0,0,0.7)" : o.halo) as never);
      map.setPaintProperty(l.id, "text-halo-width", (satellite ? 1.6 : o.width) as never);
    }
    this.onChange(mode);
  }
}
