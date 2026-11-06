import type { Route } from "./graph";

export interface BreakdownInput {
  walkToStation: { name: string; minutes: number };
  route: Route;
  stationName: (index: number) => string;
  walkToDestination: { name: string; minutes: number };
  total: number;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const mins = (m: number) => `${Math.max(1, Math.round(m))} min`;

/** One row per step of the door-to-door trip, then the total. */
export function breakdownHtml(input: BreakdownInput): string {
  const rows: [string, string][] = [];
  rows.push([`Walk to ${escapeHtml(input.walkToStation.name)}`, mins(input.walkToStation.minutes)]);
  for (const seg of input.route.segments) {
    if (seg.kind === "wait") {
      rows.push([`Wait for ${escapeHtml(seg.line)}`, `~${mins(seg.minutes)}`]);
    } else if (seg.kind === "ride") {
      const stops = seg.stops === 1 ? "1 stop" : `${seg.stops} stops`;
      rows.push([
        `Ride ${escapeHtml(seg.line)}: ${escapeHtml(input.stationName(seg.from))} → ${escapeHtml(input.stationName(seg.to))} (${stops})`,
        mins(seg.minutes),
      ]);
    } else if (seg.onFoot) {
      rows.push([
        `Walk between stations: ${escapeHtml(input.stationName(seg.station))} → ${escapeHtml(input.stationName(seg.to))}`,
        mins(seg.minutes),
      ]);
    } else {
      rows.push([`Change at ${escapeHtml(input.stationName(seg.station))}`, mins(seg.minutes)]);
    }
  }
  rows.push([`Walk to ${escapeHtml(input.walkToDestination.name)}`, mins(input.walkToDestination.minutes)]);

  const body = rows.map(([label, time]) => `<tr><td>${label}</td><td class="t">${time}</td></tr>`).join("");
  return `<table class="breakdown">${body}<tr class="total"><td>Total</td><td class="t">${mins(input.total)}</td></tr></table>`;
}
