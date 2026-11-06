import { describe, expect, it } from "vitest";
import { breakdownHtml, escapeHtml } from "./breakdown";

describe("breakdownHtml", () => {
  const html = breakdownHtml({
    walkToStation: { name: "Taman <Jaya>", minutes: 6.2 },
    route: {
      total: 30,
      segments: [
        { kind: "wait", line: "KJL", station: 0, minutes: 2 },
        { kind: "ride", line: "KJL", from: 0, to: 1, stops: 5, minutes: 10 },
        { kind: "transfer", station: 1, to: 1, minutes: 5, onFoot: false },
        { kind: "wait", line: "AGL", station: 1, minutes: 1.5 },
        { kind: "ride", line: "AGL", from: 1, to: 2, stops: 1, minutes: 4 },
      ],
    },
    stationName: (i) => ["A", "B", "C"][i],
    walkToDestination: { name: "your destination", minutes: 0.2 },
    total: 31,
  });

  it("lists walk, wait, ride, change, ride, walk in order", () => {
    const labels = [...html.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "Walk to Taman &#60;Jaya&#62;",
      "Wait for KJL",
      "Ride KJL: A → B (5 stops)",
      "Change at B",
      "Wait for AGL",
      "Ride AGL: B → C (1 stop)",
      "Walk to your destination",
      "Total",
    ]);
  });

  it("escapes station names and never shows less than 1 minute", () => {
    expect(html).not.toContain("<Jaya>");
    expect(html).toContain("1 min"); // the 0.2 min final walk
    expect(escapeHtml(`<a href="x">&`)).toBe("&#60;a href=&#34;x&#34;&#62;&#38;");
  });
});

describe("breakdownHtml with a feeder bus", () => {
  it("names the bus on the legs that use it", () => {
    const html = breakdownHtml({
      walkToStation: { name: "Surian", minutes: 25, via: "Walk, then bus T117" },
      route: { total: 10, segments: [{ kind: "ride", line: "KGL", from: 0, to: 1, stops: 3, minutes: 10 }] },
      stationName: (i) => ["Surian", "Bukit Bintang"][i],
      walkToDestination: { name: "KLCC", minutes: 14, via: "Bus T200, then walk" },
      total: 49,
    });
    expect(html).toContain("Walk, then bus T117 to Surian");
    expect(html).toContain("Bus T200, then walk to KLCC");
  });
});
