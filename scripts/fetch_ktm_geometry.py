#!/usr/bin/env python3
"""Fetch KTM Komuter track geometry from OpenStreetMap into data/ktm_shapes.json.

The KTMB GTFS feed has no shapes, so the network view would otherwise draw KTM lines as straight
segments between stations. OpenStreetMap maps each line as a route relation whose member ways run in
order along the track. This script downloads those relations through the Overpass API, chains the
ways into one polyline per line, keeps the part in and around the Klang Valley, simplifies it, and
writes it to data/ktm_shapes.json. build_network.py reads that file (it does not call Overpass), so
the normal build stays offline and deterministic. The track rarely changes: re-run this only when a
line is extended or realigned.

Data (c) OpenStreetMap contributors, available under the Open Database License
(https://www.openstreetmap.org/copyright).

Standard library only. Usage:  python scripts/fetch_ktm_geometry.py
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import gtfs_check as g
from build_network import SIMPLIFY_M, simplify, xy

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ktm_shapes.json"
RAW = ROOT / "data" / "raw" / "ktm_geom.json"

# KTMB route short name (as in the GTFS feed) -> OpenStreetMap route relation, running in one direction.
RELATIONS = {
    "Port Klang Line": 2565937,   # Pelabuhan Klang -> Tanjung Malim
    "Seremban Line": 9985624,     # Batu Caves -> Pulau Sebang/Tampin
}
MIRRORS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "klang-valley-commute-map/0.2 (one-off track geometry fetch)"
PAD_DEG = 0.06            # keep track this far outside the Klang Valley box
MAX_JOIN_GAP_M = 150      # a gap between consecutive ways larger than this is a data problem


def fetch():
    ids = "".join(f"relation({i});" for i in RELATIONS.values())
    query = f"[out:json][timeout:80];({ids});out geom;"
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)
        except Exception as err:  # try the next mirror
            last = err
            print(f"  {url}: {err}", file=sys.stderr)
            time.sleep(2)
    sys.exit(f"Could not fetch from any Overpass mirror: {last}")


def chain_ways(relation):
    """Join the relation's ways, in order, into one polyline of (lon, lat)."""
    chain = []
    for member in relation["members"]:
        if member["type"] != "way" or not member.get("geometry"):
            continue
        pts = [(p["lon"], p["lat"]) for p in member["geometry"]]
        if chain:
            d_start = math.dist(xy(*chain[-1]), xy(*pts[0]))
            d_end = math.dist(xy(*chain[-1]), xy(*pts[-1]))
            if min(d_start, d_end) > MAX_JOIN_GAP_M:
                sys.exit(f"relation {relation['id']}: a way is {min(d_start, d_end):.0f} m from the previous one")
            if d_end < d_start:
                pts.reverse()
            if min(d_start, d_end) < 0.5:
                pts = pts[1:]  # the shared vertex is already there
        chain.extend(pts)
    return chain


def clip_to_valley(points):
    """The longest run of points inside the (padded) Klang Valley box."""
    inside = [
        g.LAT_MIN - PAD_DEG <= lat <= g.LAT_MAX + PAD_DEG and g.LON_MIN - PAD_DEG <= lon <= g.LON_MAX + PAD_DEG
        for lon, lat in points
    ]
    best, start = (0, 0), None
    for i, ok in enumerate(inside + [False]):
        if ok and start is None:
            start = i
        elif not ok and start is not None:
            if i - start > best[1] - best[0]:
                best = (start, i)
            start = None
    return points[best[0]:best[1]]


def main():
    data = fetch()
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps(data), encoding="utf-8")
    by_id = {e["id"]: e for e in data["elements"]}
    shapes = {}
    for name, rel_id in RELATIONS.items():
        if rel_id not in by_id:
            sys.exit(f"relation {rel_id} ({name}) was not returned")
        full = chain_ways(by_id[rel_id])
        clipped = clip_to_valley(full)
        pts = simplify([(*xy(lon, lat), lon, lat) for lon, lat in clipped], SIMPLIFY_M)
        shapes[name] = [[round(p[2], 5), round(p[3], 5)] for p in pts]
        length_km = sum(math.dist(xy(*a), xy(*b)) for a, b in zip(clipped, clipped[1:])) / 1000
        print(f"{name}: relation {rel_id}, {len(full)} points -> {len(shapes[name])} kept, {length_km:.0f} km in the valley")
    OUT.write_text(
        json.dumps(
            {
                "_attribution": "Track geometry (c) OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright",
                "_source": "scripts/fetch_ktm_geometry.py (Overpass API route relations)",
                "shapes": shapes,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
