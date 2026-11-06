"""Check the walking assumptions against real pedestrian routing (one-off, not part of the build).

Uses the public Valhalla pedestrian router on OpenStreetMap data (valhalla1.openstreetmap.de), a few
requests a second at most, to answer two questions:

  1. How much longer than the straight line is a real walk to a station in the Klang Valley? (The
     model assumes 1.3x, at 4.5 km/h.) Samples random points 300 m to 1.5 km from random stations.
  2. How long are the hand-estimated interchange walks in data/transfers.json?

Prints a report; nothing is written. Data (c) OpenStreetMap contributors (ODbL).

Standard library only. Usage:  python scripts/calibrate_walking.py [--samples 120]
"""
import argparse
import json
import math
import random
import statistics
import sys
import time
import urllib.parse
import urllib.request
import zipfile

import build_matrix as bm
import gtfs_check as g

URL = "https://valhalla1.openstreetmap.de/route"
UA = "klang-valley-commute-map/1.0 (one-off calibration script)"


def walk(a, b):
    """(metres, seconds) of the pedestrian route from a to b, each (lat, lon); None if no route."""
    q = {"locations": [{"lat": a[0], "lon": a[1]}, {"lat": b[0], "lon": b[1]}], "costing": "pedestrian"}
    req = urllib.request.Request(f"{URL}?json={urllib.parse.quote(json.dumps(q))}", headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                s = json.load(resp)["trip"]["summary"]
            return s["length"] * 1000, s["time"]
        except Exception:
            time.sleep(2 + attempt * 3)
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--samples", type=int, default=120)
    args = ap.parse_args()
    rng = random.Random(7)
    stations = json.loads((bm.DATA_DIR / "stations.json").read_text(encoding="utf-8"))
    valley = [s for s in stations if g.in_valley({"stop_lat": s["lat"], "stop_lon": s["lon"]}) and s["lat"] > 2.9]

    ratios, speeds, banded = [], [], {300: [], 700: [], 1100: []}
    for _ in range(args.samples):
        s = rng.choice(valley)
        r = rng.uniform(300, 1500)
        th = rng.uniform(0, 2 * math.pi)
        p = (s["lat"] + r * math.cos(th) / 111320, s["lon"] + r * math.sin(th) / (111320 * math.cos(math.radians(s["lat"]))))
        res = walk(p, (s["lat"], s["lon"]))
        time.sleep(0.4)
        if not res or res[0] <= 0:
            continue
        straight = g.distance_m(p, (s["lat"], s["lon"]))
        ratios.append(res[0] / straight)
        banded[300 if r < 700 else 700 if r < 1100 else 1100].append(res[0] / straight)
        speeds.append(res[0] / res[1] * 3.6)
    ratios.sort()
    print(f"{len(ratios)} routes to stations, 300 m to 1.5 km out")
    print(f"  path / straight line:  median {statistics.median(ratios):.2f}, mean {statistics.mean(ratios):.2f}, "
          f"90th percentile {ratios[int(len(ratios) * 0.9)]:.2f}   (model: 1.30)")
    q = lambda xs, f: xs[int(len(xs) * f)]
    print(f"  quartiles:             25% {q(ratios, 0.25):.2f}, 50% {q(ratios, 0.5):.2f}, 75% {q(ratios, 0.75):.2f}")
    for lo, xs in banded.items():
        if xs:
            print(f"  from {lo} m: median {statistics.median(xs):.2f} ({len(xs)} routes)")
    print(f"  router walking speed:  {statistics.median(speeds):.1f} km/h   (model: 4.5)")

    print("\nInterchange walks in data/transfers.json (router time; the file's estimate in brackets):")
    stops = {}
    for feed in ("prasarana", "ktmb"):
        with zipfile.ZipFile(g.FEEDS[feed][1]) as zf:
            for st in g.read_table(zf, "stops.txt"):
                stops[f"{feed}:{st['stop_id']}"] = (float(st["stop_lat"]), float(st["stop_lon"]))
    for t in json.loads((bm.DATA_DIR / "transfers.json").read_text(encoding="utf-8"))["transfers"]:
        res = walk(stops[t["from"]], stops[t["to"]])
        time.sleep(0.4)
        if res:
            print(f"  {t['note']:<55} {res[0]:>5.0f} m  {res[1] / 60:>4.1f} min   [{t['walk_min']}]")
        else:
            print(f"  {t['note']:<55} no route")


if __name__ == "__main__":
    main()
