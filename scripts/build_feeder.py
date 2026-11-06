"""Build the MRT/LRT feeder-bus links in data/feeder*.json.

Rapid KL's MRT feeder buses are published as their own GTFS feed (about 90 routes, 2,000 stops).
Treating every bus stop as a station would swamp the rail matrix, so each stop is reduced to "the
best way to reach a rail station from here":

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

FEEDER = ("https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
          g.RAW_DIR / "feeder.zip")
STATION_RADIUS_M = 300  # a bus stop this close to a station counts as "at the station"
ENTRANCE_MIN = 2.0      # from the bus stop into the station
KEEP_STATIONS = 3       # best stations kept per bus stop
MAX_HEADWAY = bm.MAX_HEADWAY
to_min = bm.to_min


def headways(counts, counts_wide, counts_day, window):
    """Average gap in minutes per key, falling back to a wider window, then the whole day."""
    start, end = window
    out = {}
    for key, n in counts.items():
        out[key] = (end - start) / n
    for key, n in counts_wide.items():
        out.setdefault(key, (end - start + 2 * bm.FALLBACK_PAD) / n)
    for key, n in counts_day.items():
        out.setdefault(key, bm.SERVICE_DAY_MIN / n)
    return {k: min(v, MAX_HEADWAY) for k, v in out.items()}


def build(zf, stations, window, days):
    stops = {r["stop_id"]: r for r in g.read_table(zf, "stops.txt")}
    routes = {r["route_id"]: r["route_long_name"] or r["route_short_name"] for r in g.read_table(zf, "routes.txt")}
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

    counts, wide, day = defaultdict(int), defaultdict(int), defaultdict(int)
    rides = defaultdict(list)  # (route, direction, from stop, to stop) -> minutes
    start, end = window
    for tid, rows in seqs.items():
        t = trips[tid]
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        rd = (t["route_id"], t.get("direction_id", "0"))
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
        usable = [(s, v) for s, v in links.items() if v[0] is not None and v[1] is not None]
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


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feed")
    args = ap.parse_args()
    g.download(FEEDER[0], FEEDER[1], args.refresh)
    stations = json.loads((bm.DATA_DIR / "stations.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(FEEDER[1]) as zf:
        for name, window, days, suffix in bm.PERIODS:
            data = build(zf, stations, window, days)
            path = bm.DATA_DIR / f"feeder{suffix}.json"
            path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
            linked = len({link[0] for row in data for link in row[2]})
            print(f"{name}: {len(data)} bus stops reach {linked} stations, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
