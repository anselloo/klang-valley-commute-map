import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorTweaks } from "./basemap";
import { luminance, readableText } from "./color";

describe("colorTweaks", () => {
  it("recolours water, parks and the background", () => {
    expect(colorTweaks("water", "fill")).toHaveProperty("fill-color");
    expect(colorTweaks("park", "fill")).toHaveProperty("fill-color");
    expect(colorTweaks("background", "background")).toHaveProperty("background-color");
  });

  it("softens major roads and their casings, on land, bridges and tunnels", () => {
    for (const id of ["highway-motorway", "bridge-trunk-primary", "tunnel-secondary-tertiary", "highway-primary-casing", "highway-motorway-link-casing"]) {
      expect(colorTweaks(id, "line"), id).toHaveProperty("line-color");
    }
  });

  it("leaves minor roads, labels and unknown layers alone", () => {
    expect(colorTweaks("highway-minor", "line")).toBeNull();
    expect(colorTweaks("highway-name-major", "symbol")).toBeNull();
    expect(colorTweaks("label_city", "symbol")).toBeNull();
    expect(colorTweaks("not-a-layer", "line")).toBeNull();
  });

  it("only ever targets layers that exist in the real Bright style (when cached)", () => {
    let style: { layers: { id: string; type: string }[] };
    try {
      style = JSON.parse(readFileSync(new URL("../../data/raw/bright.json", import.meta.url), "utf-8"));
    } catch {
      return; // the style is only cached locally; nothing to check in CI
    }
    const tweaked = style.layers.filter((l) => colorTweaks(l.id, l.type));
    expect(tweaked.length).toBeGreaterThan(20);
    const ids = new Set(style.layers.map((l) => l.id));
    for (const id of ["background", "water", "park", "landcover-grass", "highway-motorway", "highway-primary"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("readableText", () => {
  it("uses dark text on light colours and white on dark ones", () => {
    expect(readableText("#FFCD00")).toBe("#1d1d1f"); // PYL yellow
    expect(readableText("#84bd00")).toBe("#1d1d1f"); // monorail green
    expect(readableText("#D50032")).toBe("#ffffff"); // KJL red
    expect(readableText("#115740")).toBe("#ffffff"); // BRT dark green
  });
  it("luminance is 0 for black and 1 for white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });
});
