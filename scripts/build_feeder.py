"""Build the bus-to-rail links in data/feeder*.json.

Rapid KL publishes two bus GTFS feeds: the MRT feeder buses (about 90 routes, 2,000 stops, real trip
times) and its city buses (about 140 routes, 4,000 stops, trips given as frequencies). Treating every
bus stop as a station would swamp the rail matrix, so each stop is reduced to "the best way to reach
a rail station from here" by a single bus (no bus-to-bus changes):

  stop P -> station S   wait for the bus at P (half the gap between buses) + ride to a stop beside S
  station S -> stop P   wait at S's stop + ride to P

Only the best few stations per stop are kept. The browser adds a bus stop within a 500 m walk to a
place's options for reaching the rail network (the "Walk + feeder bus" choice).

Run after build_matrix.py (it needs data/stations.json). One file per time period, like the matrices:
feeder.json, feeder-pm.json, feeder-sat.json, feeder-sun.json. Each is a list of
[lat, lon, [[station index, minutes to the station, minutes from the station, route name], ...]].

Standard library only. Usage:  python scripts/build_feeder.py [--refresh]
"""
import argparse
import json
import statistics
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import build_matrix as bm
import gtfs_check as g

FEEDS = [
    ("https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder", g.RAW_DIR / "feeder.zip"),
    ("https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl", g.RAW_DIR / "bus_kl.zip"),
]
STATION_RADIUS_M = 300  # a bus stop this close to a station counts as "at the station"
ENTRANCE_MIN = 2.0      # from the bus stop into the station
KEEP_STATIONS = 3       # best stations kept per bus stop
MAX_LINK_MIN = 75       # a bus ride to or from the station longer than this is not a practical way to reach it
MAX_HEADWAY = bm.MAX_HEADWAY
to_min = bm.to_min


def headways(counts, counts_wide, counts_day, window):
    """Average gap in minutes per key, falling back to a wider window, then the whole day."""
    start, end = window
    out = {}
    for key, n in counts.items():
        if n > 0:
            out[key] = (end - start) / n
    for key, n in counts_wide.items():
        if n > 0:
            out.setdefault(key, (end - start + 2 * bm.FALLBACK_PAD) / n)
    for key, n in counts_day.items():
        if n > 0:
            out.setdefault(key, bm.SERVICE_DAY_MIN / n)
    return {k: min(v, MAX_HEADWAY) for k, v in out.items()}


def build(zf, stations, window, days):
    stops = {r["stop_id"]: r for r in g.read_table(zf, "stops.txt")}
    # Name shown in the trip breakdown: the route number (300, T117), else its description.
    routes = {r["route_id"]: r["route_short_name"] or r["route_long_name"] for r in g.read_table(zf, "routes.txt")}
    services, _ = g.services_on(g.read_table(zf, "calendar.txt"), days)
    trips = {t["trip_id"]: t for t in g.read_table(zf, "trips.txt") if t["service_id"] in services}
    seqs = defaultdict(list)
    for st in g.read_table(zf, "stop_times.txt"):
        if st["trip_id"] in trips:
            seqs[st["trip_id"]].append(st)

    # Which stops are beside which station.
    near_station = {}
    for sid, s in stops.items():
        lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        if not g.in_valley(s):
            continue
        for i, st in enumerate(stations):
            if g.distance_m((lat, lon), (st["lat"], st["lon"])) <= STATION_RADIUS_M:
                near_station[sid] = i
                break

    freqs = defaultdict(list)
    for f in g.read_table(zf, "frequencies.txt"):
        freqs[f["trip_id"]].append(f)
    counts, wide, day = defaultdict(float), defaultdict(float), defaultdict(float)
    rides = defaultdict(list)  # (route, direction, from stop, to stop) -> minutes
    start, end = window
    for tid, rows in seqs.items():
        t = trips[tid]
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        rd = (t["route_id"], t.get("direction_id", "0"))
        if tid in freqs:
            # A trip given as frequencies: it runs every headway_secs between start_time and end_time.
            for f in freqs[tid]:
                f0, f1, gap = to_min(f["start_time"]), to_min(f["end_time"]), float(f["headway_secs"]) / 60
                for r in rows:
                    key = (*rd, r["stop_id"])
                    day[key] += (f1 - f0) / gap
                    wide[key] += max(0, min(f1, end + bm.FALLBACK_PAD) - max(f0, start - bm.FALLBACK_PAD)) / gap
                    counts[key] += max(0, min(f1, end) - max(f0, start)) / gap
        else:
            for r in rows:
                key = (*rd, r["stop_id"])
                dep = to_min(r["departure_time"])
                day[key] += 1
                if start - bm.FALLBACK_PAD <= dep < end + bm.FALLBACK_PAD:
                    wide[key] += 1
                if start <= dep < end:
                    counts[key] += 1
        # Ride times from every stop to the next station stop, and from a station stop to every later stop.
        for k, r in enumerate(rows):
            if r["stop_id"] not in near_station:
                continue
            for j, o in enumerate(rows):
                if j == k:
                    continue
                if j < k:
                    rides[(*rd, o["stop_id"], r["stop_id"])].append(to_min(r["arrival_time"]) - to_min(o["departure_time"]))
                else:
                    rides[(*rd, r["stop_id"], o["stop_id"])].append(to_min(o["arrival_time"]) - to_min(r["departure_time"]))
    gaps = headways(counts, wide, day, window)

    best = defaultdict(dict)  # stop -> station -> [access, egress, route]
    for (route, direction, a, b), samples in rides.items():
        ride = statistics.median(samples)
        if ride <= 0:
            continue
        name = routes.get(route, route)
        if b in near_station and a not in near_station:  # bus stop -> station
            p, s = a, near_station[b]
            access = gaps.get((route, direction, a), MAX_HEADWAY) / 2 + ride + ENTRANCE_MIN
            slot = best[p].setdefault(s, [None, None, name])
            if slot[0] is None or access < slot[0]:
                slot[0], slot[2] = access, name
        if a in near_station and b not in near_station:  # station -> bus stop
            p, s = b, near_station[a]
            egress = gaps.get((route, direction, a), MAX_HEADWAY) / 2 + ride + ENTRANCE_MIN
            slot = best[p].setdefault(s, [None, None, name])
            if slot[1] is None or egress < slot[1]:
                slot[1] = egress

    out = []
    for p, links in best.items():
        usable = [(s, v) for s, v in links.items()
                  if v[0] is not None and v[1] is not None and v[0] <= MAX_LINK_MIN and v[1] <= MAX_LINK_MIN]
        usable.sort(key=lambda kv: kv[1][0])
        if not usable:
            continue
        stop = stops[p]
        out.append([
            round(float(stop["stop_lat"]), 5), round(float(stop["stop_lon"]), 5),
            [[s, round(v[0], 1), round(v[1], 1), v[2]] for s, v in usable[:KEEP_STATIONS]],
        ])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def merge(parts):
    """Combine the per-feed results: for a stop at the same spot, keep the better link to each station."""
    best = {}
    for rows in parts:
        for lat, lon, links in rows:
            slot = best.setdefault((lat, lon), {})
            for station, to, frm, route in links:
                old = slot.get(station)
                if old is None or to < old[0]:
                    slot[station] = (to, frm, route)
    out = []
    for (lat, lon), slot in best.items():
        links = sorted(slot.items(), key=lambda kv: kv[1][0])[:KEEP_STATIONS]
        out.append([lat, lon, [[s, v[0], v[1], v[2]] for s, v in links]])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feeds")
    args = ap.parse_args()
    for url, path in FEEDS:
        g.download(url, path, args.refresh)
    stations = json.loads((bm.DATA_DIR / "stations.json").read_text(encoding="utf-8"))
    for name, window, days, suffix in bm.PERIODS:
        parts = []
        for _, path in FEEDS:
            with zipfile.ZipFile(path) as zf:
                parts.append(build(zf, stations, window, days))
        data = merge(parts)
        out = bm.DATA_DIR / f"feeder{suffix}.json"
        out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        linked = len({link[0] for row in data for link in row[2]})
        print(f"{name}: {len(data)} bus stops reach {linked} stations, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
