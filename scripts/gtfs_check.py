#!/usr/bin/env python3
"""Milestone 1: data sanity check.

Downloads the two static GTFS feeds from api.data.gov.my, filters them to
weekday Klang Valley rail service, and prints the routes and station count so
the output can be eyeballed before building anything on top of it.

Standard library only. Usage:  python scripts/gtfs_check.py [--refresh]
"""
import argparse
import csv
import io
import math
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
USER_AGENT = "klang-valley-commute-map/0.1 (GTFS sanity check)"

FEEDS = {
    "prasarana": (
        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
        RAW_DIR / "prasarana_rail.zip",
    ),
    "ktmb": ("https://api.data.gov.my/gtfs-static/ktmb", RAW_DIR / "ktmb.zip"),
}

# Rough Klang Valley bounding box. KTM Komuter lines run well outside it
# (Tanjung Malim, Seremban, Pulau Sebang), so stops outside are dropped.
LAT_MIN, LAT_MAX = 2.80, 3.40
LON_MIN, LON_MAX = 101.35, 101.90

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]
INTERCHANGE_RADIUS_M = 150  # stops closer than this count as one station


def download(url, dest, refresh):
    if dest.exists() and not refresh:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def read_table(zf, name):
    """Read a GTFS text file from the zip as a list of dicts (empty if absent)."""
    if name not in zf.namelist():
        return []
    text = zf.read(name).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def weekday_services(calendar):
    """service_ids that run on at least one Mon-Fri day, plus any expiry warnings."""
    return services_on(calendar, WEEKDAYS)


def services_on(calendar, days):
    """service_ids that run on at least one of the named days (e.g. ["saturday"]), plus expiry warnings."""
    ids, warnings = set(), []
    today = date.today().strftime("%Y%m%d")
    for row in calendar:
        if any(row[d] == "1" for d in days):
            ids.add(row["service_id"])
            if row["end_date"] < today:
                warnings.append(f"service '{row['service_id']}' ended {row['end_date']}")
    return ids, warnings


def in_valley(stop):
    lat, lon = float(stop["stop_lat"]), float(stop["stop_lon"])
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def distance_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def load_feed(zf, route_filter):
    """Return (routes, trips_by_route, stops_by_route, dropped_outside, warnings)."""
    routes = {r["route_id"]: r for r in read_table(zf, "routes.txt") if route_filter(r)}
    services, warnings = weekday_services(read_table(zf, "calendar.txt"))
    trips = {
        t["trip_id"]: t["route_id"]
        for t in read_table(zf, "trips.txt")
        if t["route_id"] in routes and t["service_id"] in services
    }
    stops = {s["stop_id"]: s for s in read_table(zf, "stops.txt")}

    stops_by_route = defaultdict(set)
    for st in read_table(zf, "stop_times.txt"):
        route = trips.get(st["trip_id"])  # stop_times.route_id is unreliable; join via trips
        if route:
            stops_by_route[route].add(st["stop_id"])

    trip_counts = defaultdict(int)
    for route in trips.values():
        trip_counts[route] += 1

    dropped = set()
    for route, ids in stops_by_route.items():
        for sid in list(ids):
            if sid not in stops or not in_valley(stops[sid]):
                ids.discard(sid)
                dropped.add(sid)
    return routes, trip_counts, stops_by_route, stops, dropped, warnings


def prasarana_filter(r):
    return r.get("status", "valid") == "valid" and r["route_type"] in ("0", "1")


def ktmb_filter(r):
    # Komuter routes only: the intercity routes (ETS, ERT, ...) link to the intercity page.
    return "komuter" in r.get("route_url", "").lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feeds")
    args = ap.parse_args()

    for url, dest in FEEDS.values():
        download(url, dest, args.refresh)

    results = {}
    for name, filt in (("prasarana", prasarana_filter), ("ktmb", ktmb_filter)):
        with zipfile.ZipFile(FEEDS[name][1]) as zf:
            results[name] = load_feed(zf, filt)

    all_stops = {}  # (feed, stop_id) -> stop row
    print("\n=== Routes (weekday service, Klang Valley stops only) ===")
    for name, (routes, trip_counts, stops_by_route, stops, dropped, warnings) in results.items():
        print(f"\n[{name}]")
        for rid, r in routes.items():
            short = r.get("route_short_name", "")
            long_name = r.get("route_long_name", "")
            n_stops, n_trips = len(stops_by_route.get(rid, ())), trip_counts.get(rid, 0)
            note = "" if n_stops else "  <-- no weekday Klang Valley stops, excluded"
            print(f"  {rid:<10} {short:<20} {long_name:<55} stops={n_stops:<3} weekday trips={n_trips}{note}")
            for sid in stops_by_route.get(rid, ()):
                all_stops[(name, sid)] = stops[sid]
        for w in warnings:
            print(f"  WARNING: {w}")
        if dropped:
            names = sorted(stops[s]["stop_name"] for s in dropped if s in stops)
            print(f"  Dropped {len(dropped)} stops outside the bounding box: {', '.join(names)}")

    # Merge stops that are really one interchange (e.g. per-line platforms) by proximity.
    items = list(all_stops.items())
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    coords = [(float(s["stop_lat"]), float(s["stop_lon"])) for _, s in items]
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if distance_m(coords[i], coords[j]) <= INTERCHANGE_RADIUS_M:
                parent[find(i)] = find(j)
    stations = len({find(i) for i in range(len(items))})

    print("\n=== Station count ===")
    for name in results:
        n = sum(1 for k in all_stops if k[0] == name)
        print(f"  {name:<10} {n} stops")
    print(f"  total stops (platform-level, per feed): {len(all_stops)}")
    print(f"  distinct stations (stops within {INTERCHANGE_RADIUS_M} m merged): {stations}")

    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    print(f"  coordinate range: lat {min(lats):.4f}..{max(lats):.4f}, lon {min(lons):.4f}..{max(lons):.4f}")


if __name__ == "__main__":
    main()
