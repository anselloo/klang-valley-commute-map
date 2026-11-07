import type { Route } from "./graph";
import { lineLabel, t } from "./i18n";

export interface BreakdownInput {
  walkToStation: { name: string; minutes: number; via?: string };
  route: Route;
  stationName: (index: number) => string;
  walkToDestination: { name: string; minutes: number; via?: string };
  total: number;
  /** "Walk" (default) or e.g. "Walk or e-hail"; used for the first and last leg. */
  verb?: string;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const mins = (m: number) => t("min", { n: Math.max(1, Math.round(m)) });

/** One row per step of the door-to-door trip, then the total. */
export function breakdownHtml(input: BreakdownInput): string {
  const rows: [string, string][] = [];
  const verb = escapeHtml(input.verb ?? t("verb.walk"));
  const leg = (l: { name: string; via?: string }) =>
    t("bd.to", { verb: l.via ? escapeHtml(l.via) : verb, name: escapeHtml(l.name) });
  rows.push([leg(input.walkToStation), mins(input.walkToStation.minutes)]);
  for (const seg of input.route.segments) {
    if (seg.kind === "wait") {
      rows.push([t("bd.wait", { line: escapeHtml(lineLabel(seg.line)) }), `~${mins(seg.minutes)}`]);
    } else if (seg.kind === "ride") {
      const stops = seg.stops === 1 ? t("bd.stops.one") : t("bd.stops.many", { n: seg.stops });
      rows.push([
        t("bd.ride", {
          line: escapeHtml(lineLabel(seg.line)),
          from: escapeHtml(input.stationName(seg.from)),
          to: escapeHtml(input.stationName(seg.to)),
          stops,
        }),
        mins(seg.minutes),
      ]);
    } else if (seg.kind === "bus") {
      rows.push([
        t(seg.routes.includes(" > ") ? "bd.bus.many" : "bd.bus.one", {
          r: escapeHtml(seg.routes.replaceAll(" > ", t("bus.sep"))),
          from: escapeHtml(input.stationName(seg.from)),
          to: escapeHtml(input.stationName(seg.to)),
        }),
        mins(seg.minutes),
      ]);
    } else if (seg.onFoot) {
      rows.push([
        t("bd.walk.between", { from: escapeHtml(input.stationName(seg.station)), to: escapeHtml(input.stationName(seg.to)) }),
        mins(seg.minutes),
      ]);
    } else {
      rows.push([t("bd.change", { station: escapeHtml(input.stationName(seg.station)) }), mins(seg.minutes)]);
    }
  }
  rows.push([leg(input.walkToDestination), mins(input.walkToDestination.minutes)]);

  const body = rows.map(([label, time]) => `<tr><td>${label}</td><td class="t">${time}</td></tr>`).join("");
  return `<table class="breakdown">${body}<tr class="total"><td>${t("bd.total")}</td><td class="t">${mins(input.total)}</td></tr></table>`;
}
