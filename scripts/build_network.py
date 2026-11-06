#!/usr/bin/env python3
"""v2: build the data behind the animated train network view.

Reads the cached GTFS feeds (see gtfs_check.py) and data/stations.json (from build_matrix.py)
and writes data/network.json:

  lines     id, name, long name, mode, colour, and the polyline to draw
  shapes    simplified track geometry shared by the trains of one Prasarana line
  patterns  one stopping pattern: station indices, distance along the shape (metres, shaped
            patterns only), and arrival / departure seconds relative to the trip start
  trips     [pattern index, start second], sorted by start time

Prasarana publishes track geometry and frequencies, so its trains are expanded from the
frequency table and follow the real shape. KTM Komuter has no geometry, so its patterns are
drawn as straight lines between stations and its trips are the actual timetable.

Standard library only. Usage:  python scripts/build_network.py [--refresh]
"""
import argparse
import json
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import gtfs_check as g

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

SIMPLIFY_M = 6.0        # Douglas-Peucker tolerance for track geometry
MAX_STOP_OFFSET_M = 400  # warn if a stop is further than this from its line's shape
MAX_STATION_MATCH_M = 400
MODES = {"LRT": "LRT", "MRT": "MRT", "MRL": "Monorail", "MR": "Monorail", "BRT": "BRT"}

LAT0, LON0 = 3.1, 101.6
M_PER_LAT = 110574.0
M_PER_LON = 111320.0 * math.cos(math.radians(LAT0))


def to_sec(t):
    h, m, s = (int(x) for x in t.strip().split(":"))
    return h * 3600 + m * 60 + s


def xy(lon, lat):
    return ((lon - LON0) * M_PER_LON, (lat - LAT0) * M_PER_LAT)


def simplify(points, tol):
    """Douglas-Peucker on [(x, y, lon, lat)] keeping the first and last point."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a][:2]
        bx, by = points[b][:2]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i][:2]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def project_forward(poly, cum, px, py, start_seg):
    """Nearest point on the polyline at or after segment start_seg: (distance along, offset, segment)."""
    best = (math.inf, 0.0, start_seg)
    for i in range(start_seg, len(poly) - 1):
        ax, ay = poly[i][:2]
        bx, by = poly[i + 1][:2]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        qx, qy = ax + t * dx, ay + t * dy
        off = math.hypot(px - qx, py - qy)
        if off < best[0]:
            best = (off, cum[i] + t * math.sqrt(seg2), i)
    return best[1], best[0], best[2]


def read_shapes(zf):
    shapes = defaultdict(list)
    for r in g.read_table(zf, "shapes.txt"):
        shapes[r["shape_id"]].append((int(r["shape_pt_sequence"]), float(r["shape_pt_lon"]), float(r["shape_pt_lat"])))
    out = {}
    for sid, pts in shapes.items():
        pts.sort()
        out[sid] = [(*xy(lon, lat), lon, lat) for _, lon, lat in pts]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feeds")
    args = ap.parse_args()
    for url, dest in g.FEEDS.values():
        g.download(url, dest, args.refresh)

    stations = json.loads((DATA_DIR / "stations.json").read_text(encoding="utf-8"))
    st_xy = [xy(s["lon"], s["lat"]) for s in stations]

    def station_of(lon, lat):
        x, y = xy(lon, lat)
        i = min(range(len(stations)), key=lambda k: (st_xy[k][0] - x) ** 2 + (st_xy[k][1] - y) ** 2)
        d = math.hypot(st_xy[i][0] - x, st_xy[i][1] - y)
        if d > MAX_STATION_MATCH_M:
            return None
        return i

    lines, shapes_out, patterns, trips = [], [], [], []
    warnings = []

    # ---- Prasarana: real shapes, frequency-based trips -------------------------------------
    with zipfile.ZipFile(g.FEEDS["prasarana"][1]) as zf:
        routes = [r for r in g.read_table(zf, "routes.txt") if g.prasarana_filter(r)]
        services, _ = g.weekday_services(g.read_table(zf, "calendar.txt"))
        stops = {s["stop_id"]: s for s in g.read_table(zf, "stops.txt")}
        shape_pts = read_shapes(zf)
        all_trips = [t for t in g.read_table(zf, "trips.txt") if t["service_id"] in services]
        times = defaultdict(list)
        for st in g.read_table(zf, "stop_times.txt"):
            times[st["trip_id"]].append(st)
        freqs = defaultdict(list)
        for f in g.read_table(zf, "frequencies.txt"):
            freqs[f["trip_id"]].append(f)

        for route in routes:
            rid = route["route_id"]
            rtrips = [t for t in all_trips if t["route_id"] == rid]
            if not rtrips:
                continue
            ref = next((t for t in rtrips if t["direction_id"] == "0"), rtrips[0])
            raw = shape_pts.get(ref["shape_id"])
            if not raw:
                warnings.append(f"{rid}: no shape {ref['shape_id']}")
                continue
            poly = simplify(raw, SIMPLIFY_M)
            cum = [0.0]
            for a, b in zip(poly, poly[1:]):
                cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))

            # Distance along the shape of every stop of the line, walking the reference direction.
            ref_rows = sorted(times[ref["trip_id"]], key=lambda r: int(r["stop_sequence"]))
            dist_of, seg = {}, 0
            for r in ref_rows:
                s = stops[r["stop_id"]]
                x, y = xy(float(s["stop_lon"]), float(s["stop_lat"]))
                d, off, seg = project_forward(poly, cum, x, y, seg)
                dist_of[r["stop_id"]] = round(d)
                if off > MAX_STOP_OFFSET_M:
                    warnings.append(f"{rid}: stop {s['stop_name']} is {off:.0f} m from the shape")

            line_idx = len(lines)
            shape_idx = len(shapes_out)
            shapes_out.append([[round(p[2], 5), round(p[3], 5)] for p in poly])
            lines.append({
                "id": f"prasarana:{rid}",
                "name": route["route_short_name"],
                "longName": route["route_long_name"],
                "mode": MODES.get(route.get("category", ""), "Rail"),
                "color": "#" + route["route_color"].lstrip("#"),
                "shape": shape_idx,
            })

            for t in rtrips:
                rows = sorted(times[t["trip_id"]], key=lambda r: int(r["stop_sequence"]))
                idxs, d, arr, dep, ok = [], [], [], [], True
                t0 = to_sec(rows[0]["arrival_time"])
                for r in rows:
                    s = stops[r["stop_id"]]
                    si = station_of(float(s["stop_lon"]), float(s["stop_lat"]))
                    if si is None or r["stop_id"] not in dist_of:
                        ok = False
                        break
                    idxs.append(si)
                    d.append(dist_of[r["stop_id"]])
                    arr.append(to_sec(r["arrival_time"]) - t0)
                    dep.append(to_sec(r["departure_time"]) - t0)
                if not ok:
                    warnings.append(f"{rid}: trip {t['trip_id']} skipped (stop not matched)")
                    continue
                pat_idx = len(patterns)
                patterns.append({"line": line_idx, "shape": shape_idx, "stops": idxs, "d": d, "arr": arr, "dep": dep})
                for f in freqs.get(t["trip_id"], ()):
                    start, end, hw = to_sec(f["start_time"]), to_sec(f["end_time"]), int(f["headway_secs"])
                    for s0 in range(start, end, hw):
                        trips.append([pat_idx, s0])

    # ---- KTM Komuter: straight lines between stations, real trips --------------------------
    with zipfile.ZipFile(g.FEEDS["ktmb"][1]) as zf:
        routes = [r for r in g.read_table(zf, "routes.txt") if g.ktmb_filter(r)]
        services, _ = g.weekday_services(g.read_table(zf, "calendar.txt"))
        stops = {s["stop_id"]: s for s in g.read_table(zf, "stops.txt")}
        all_trips = [t for t in g.read_table(zf, "trips.txt") if t["service_id"] in services]
        times = defaultdict(list)
        for st in g.read_table(zf, "stop_times.txt"):
            times[st["trip_id"]].append(st)

        for route in routes:
            rid = route["route_id"]
            seen = {}  # (direction, station tuple) -> pattern index
            line_patterns = []
            for t in all_trips:
                if t["route_id"] != rid:
                    continue
                rows = sorted(times[t["trip_id"]], key=lambda r: int(r["stop_sequence"]))
                kept = [(r, s) for r in rows if (s := stops.get(r["stop_id"])) and g.in_valley(s)]
                # Stops closer than the interchange radius share one station: merge consecutive repeats
                # (arrive at the first, depart from the last) instead of dropping the trip.
                merged = []  # [station, arrival, departure]
                for r, s in kept:
                    si = station_of(float(s["stop_lon"]), float(s["stop_lat"]))
                    arr_s, dep_s = to_sec(r["arrival_time"]), to_sec(r["departure_time"])
                    if merged and merged[-1][0] == si:
                        merged[-1][2] = dep_s
                    else:
                        merged.append([si, arr_s, dep_s])
                idxs = [m[0] for m in merged]
                if len(merged) < 2 or None in idxs or len(set(idxs)) != len(idxs):
                    continue
                t0 = merged[0][1]
                key = (t["direction_id"], tuple(idxs))
                if key not in seen:
                    seen[key] = len(patterns)
                    patterns.append({
                        "line": len(lines), "shape": None, "stops": idxs,
                        "arr": [m[1] - t0 for m in merged], "dep": [m[2] - t0 for m in merged],
                    })
                    line_patterns.append(seen[key])
                trips.append([seen[key], t0])
            if not line_patterns:
                continue  # no Klang Valley service (e.g. the northern lines)
            longest = max(line_patterns, key=lambda p: len(patterns[p]["stops"]))
            lines.append({
                "id": f"ktmb:{rid}",
                "name": route["route_short_name"],
                "longName": route["route_long_name"],
                "mode": "KTM Komuter",
                "color": "#" + route["route_color"].lstrip("#"),
                "path": patterns[longest]["stops"],
            })

    trips.sort(key=lambda t: (t[1], t[0]))
    network = {"lines": lines, "shapes": shapes_out, "patterns": patterns, "trips": trips}
    out = DATA_DIR / "network.json"
    out.write_text(json.dumps(network, separators=(",", ":")), encoding="utf-8")

    # ---- Report ------------------------------------------------------------------------------
    print(f"{len(lines)} lines, {len(shapes_out)} shapes, {len(patterns)} patterns, {len(trips)} trips, "
          f"{out.stat().st_size // 1024} KB")
    per_line = defaultdict(int)
    for pat, _ in trips:
        per_line[patterns[pat]["line"]] += 1
    for i, ln in enumerate(lines):
        print(f"  {ln['name']:<18} {ln['mode']:<12} {per_line[i]:>4} trips/day")
    for sec, label in ((7.5 * 3600, "7:30 am"), (12 * 3600, "noon"), (23.5 * 3600, "11:30 pm")):
        n = sum(1 for pat, start in trips
                if start <= sec <= start + patterns[pat]["arr"][-1])
        print(f"  trains running at {label}: {n}")
    for w in warnings:
        print("WARNING:", w, file=sys.stderr)


if __name__ == "__main__":
    main()
