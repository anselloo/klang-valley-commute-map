#!/usr/bin/env python3
"""Milestone 2: build station-to-station travel times.

Reads the cached GTFS feeds (see gtfs_check.py), and writes
  data/stations.json         - id, name, lat, lon, lines
  data/matrix.json           - minutes between every pair of stations (null = unreachable)
  data/graph.json            - compact line graph, so the browser can rebuild the route
                               for a single trip (used for the breakdown popup)

Everything is built for a weekday morning, departing 7:00-9:00.

Cost model:
  * in-vehicle time from stop_times
  * initial wait   = half the average headway of the line in the window
  * transfer       = half the headway of the next line + 5 min penalty
  * out-of-system walking transfers (data/transfers.json) cost their walk time
    instead of the 5 min penalty

Standard library only. Usage:  python scripts/build_matrix.py [--refresh]
"""
import argparse
import heapq
import json
import re
import statistics
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import gtfs_check as g

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Weekday-morning departure window, in minutes after midnight.
WINDOW = (7 * 60, 9 * 60)
FALLBACK_PAD = 60  # stops with no departure in the window use the window padded by this much
TRANSFER_PENALTY = 5.0


def to_min(t):
    h, m, s = (int(x) for x in t.strip().split(":"))
    return h * 60 + m + s / 60


def line_data(feed, zf, route_filter, window):
    """Extract line edges and headways for one feed.

    Returns (route_names, edges, headway, stop_rows) where
      edges[(rkey, dir)][(stop_a, stop_b)] -> minutes between consecutive stops
      headway[(rkey, dir, stop)]           -> average headway in minutes
    Stop ids are prefixed with the feed name.
    """
    window_start, window_end = window
    routes = {r["route_id"]: r for r in g.read_table(zf, "routes.txt") if route_filter(r)}
    services, _ = g.weekday_services(g.read_table(zf, "calendar.txt"))
    trips = {
        t["trip_id"]: t
        for t in g.read_table(zf, "trips.txt")
        if t["route_id"] in routes and t["service_id"] in services
    }
    stop_rows = {f"{feed}:{s['stop_id']}": s for s in g.read_table(zf, "stops.txt")}
    seqs = defaultdict(list)
    for st in g.read_table(zf, "stop_times.txt"):
        if st["trip_id"] in trips:
            seqs[st["trip_id"]].append(st)

    freqs = defaultdict(list)
    for f in g.read_table(zf, "frequencies.txt"):
        if f["trip_id"] in trips:
            freqs[f["trip_id"]].append(f)

    names = {f"{feed}:{rid}": r["route_short_name"] for rid, r in routes.items()}
    edge_samples = defaultdict(lambda: defaultdict(lambda: ([], [])))  # in-window, all
    dep_counts = defaultdict(int)
    dep_counts_wide = defaultdict(int)
    freq_headway = {}

    for trip_id, trip in trips.items():
        rkey, direction = f"{feed}:{trip['route_id']}", trip.get("direction_id", "0")
        line = (rkey, direction)
        rows = sorted(seqs.get(trip_id, ()), key=lambda r: int(r["stop_sequence"]))
        for a, b in zip(rows, rows[1:]):
            sa, sb = f"{feed}:{a['stop_id']}", f"{feed}:{b['stop_id']}"
            dur = to_min(b["arrival_time"]) - to_min(a["arrival_time"])
            in_win = window_start - 30 <= to_min(a["departure_time"]) <= window_end + 30
            edge_samples[line][(sa, sb)][0 if in_win else 1].append(dur)
        if trip_id in freqs:
            # Frequency-based trip: expected trains per window = sum(overlap / headway).
            trains = 0.0
            for f in freqs[trip_id]:
                lo = max(window_start, to_min(f["start_time"]))
                hi = min(window_end, to_min(f["end_time"]))
                if hi > lo:
                    trains += (hi - lo) / (float(f["headway_secs"]) / 60)
            if trains:
                for r in rows:
                    freq_headway[(rkey, direction, f"{feed}:{r['stop_id']}")] = (
                        (window_end - window_start) / trains
                    )
        else:
            for r in rows:
                key = (rkey, direction, f"{feed}:{r['stop_id']}")
                dep = to_min(r["departure_time"])
                if window_start <= dep < window_end:
                    dep_counts[key] += 1
                if window_start - FALLBACK_PAD <= dep < window_end + FALLBACK_PAD:
                    dep_counts_wide[key] += 1

    headway = dict(freq_headway)
    for key, n in dep_counts.items():
        headway[key] = (window_end - window_start) / n
    for key, n in dep_counts_wide.items():
        if key not in headway:
            headway[key] = (window_end - window_start + 2 * FALLBACK_PAD) / n

    edges = defaultdict(dict)
    for line, pairs in edge_samples.items():
        for pair, (in_win, anywhere) in pairs.items():
            samples = in_win or anywhere
            edges[line][pair] = statistics.median(samples)
    return names, edges, headway, stop_rows


def cluster_stops(stops):
    """Union stops within INTERCHANGE_RADIUS_M of each other. Returns {stop_id: cluster_id}."""
    ids = list(stops)
    parent = {i: i for i in ids}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    pos = {i: (float(stops[i]["stop_lat"]), float(stops[i]["stop_lon"])) for i in ids}
    for x, a in enumerate(ids):
        for b in ids[x + 1:]:
            if g.distance_m(pos[a], pos[b]) <= g.INTERCHANGE_RADIUS_M:
                parent[find(a)] = find(b)
    return {i: find(i) for i in ids}


def clean_name(name):
    return re.sub(r"\s*-\s*REDONE$", "", name.strip())


ACRONYMS = {"KL", "KLCC", "PWTC", "USJ", "SS", "UKM", "UPM", "UOB", "IOI", "CBP", "SA", "TTDI"}


def display_name(name):
    """Title-case a station name but keep known acronyms upper-case (KL Sentral, not Kl Sentral)."""
    return re.sub(
        r"[A-Za-z']+",
        lambda m: m.group(0).upper() if m.group(0).upper() in ACRONYMS else m.group(0).title(),
        name,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feeds")
    args = ap.parse_args()
    for url, dest in g.FEEDS.values():
        g.download(url, dest, args.refresh)

    route_names, stop_rows = {}, {}
    edges, headway = {}, {}
    for feed, filt in (("prasarana", g.prasarana_filter), ("ktmb", g.ktmb_filter)):
        with zipfile.ZipFile(g.FEEDS[feed][1]) as zf:
            n, e, h, s = line_data(feed, zf, filt, WINDOW)
        route_names.update(n)
        edges.update(e)
        headway.update(h)
        stop_rows.update(s)

    # Keep only Klang Valley stops that appear on a line edge.
    used = {s for pairs in edges.values() for pair in pairs for s in pair}
    valley = {s for s in used if s in stop_rows and g.in_valley(stop_rows[s])}
    cluster_of = cluster_stops({s: stop_rows[s] for s in valley})

    # Build stations (one per cluster).
    members = defaultdict(list)
    for s, c in cluster_of.items():
        members[c].append(s)
    lines_at = defaultdict(set)
    for (rkey, _), pairs in edges.items():
        for a, b in pairs:
            for s in (a, b):
                if s in valley:
                    lines_at[cluster_of[s]].add(route_names[rkey])

    ordered = sorted(
        members,
        key=lambda c: (min(clean_name(stop_rows[s]["stop_name"]) for s in members[c]), c),
    )
    index = {c: i for i, c in enumerate(ordered)}
    stations = []
    for c in ordered:
        ss = members[c]
        stations.append({
            "id": f"S{index[c]:03d}",
            "name": display_name(min((clean_name(stop_rows[s]["stop_name"]) for s in ss), key=len)),
            "lat": round(sum(float(stop_rows[s]["stop_lat"]) for s in ss) / len(ss), 6),
            "lon": round(sum(float(stop_rows[s]["stop_lon"]) for s in ss) / len(ss), 6),
            "lines": sorted(lines_at[c]),
        })
    station_of = {s: index[c] for s, c in cluster_of.items()}
    n = len(stations)

    def solve(edges, headway):
        """Build the graph for one window; return (matrix, graph export)."""
        # Graph. Nodes: ("T", st) arrived by train, ("W", st) arrived on foot,
        # ("L", rkey, dir, stop) on a vehicle.
        ride = defaultdict(list)    # line node -> [(line node, minutes)]
        board = defaultdict(list)   # station -> [(line node, headway)]
        for (rkey, d), pairs in edges.items():
            for (a, b), dur in pairs.items():
                if a in valley and b in valley and dur > 0:
                    ride[("L", rkey, d, a)].append((("L", rkey, d, b), dur))
            for stop in {s for pair in pairs for s in pair}:
                hw = headway.get((rkey, d, stop))
                if stop in valley and hw:
                    board[station_of[stop]].append((("L", rkey, d, stop), hw))

        walk = defaultdict(list)
        transfers = json.loads((DATA_DIR / "transfers.json").read_text(encoding="utf-8"))["transfers"]
        for t in transfers:
            for key in (t["from"], t["to"]):
                if key not in station_of:
                    sys.exit(f"transfers.json: unknown or out-of-valley stop {key}")
            a, b = station_of[t["from"]], station_of[t["to"]]
            if a != b:
                walk[a].append((b, t["walk_min"]))
                walk[b].append((a, t["walk_min"]))

        def dijkstra(src):
            dist = {}
            heap = [(0.0, ("W", src))]
            # Walking transfers out of the origin cost walk time, with no extra penalty.
            for other, w in walk[src]:
                heap.append((float(w), ("W", other)))
            heapq.heapify(heap)
            while heap:
                d, node = heapq.heappop(heap)
                if node in dist:
                    continue
                dist[node] = d
                kind = node[0]
                if kind in ("T", "W"):
                    st = node[1]
                    extra = TRANSFER_PENALTY if kind == "T" else 0.0
                    for ln, hw in board[st]:
                        heapq.heappush(heap, (d + hw / 2 + extra, ln))
                    if kind == "T":
                        for other, w in walk[st]:
                            heapq.heappush(heap, (d + w, ("W", other)))
                else:
                    for nxt, dur in ride[node]:
                        heapq.heappush(heap, (d + dur, nxt))
                    heapq.heappush(heap, (d, ("T", station_of[node[3]])))
            return dist

        matrix = []
        for src in range(n):
            dist = dijkstra(src)
            row = []
            for dst in range(n):
                if dst == src:
                    row.append(0)
                    continue
                best = min(dist.get(("T", dst), float("inf")), dist.get(("W", dst), float("inf")))
                row.append(None if best == float("inf") else round(best, 1))
            matrix.append(row)

        # Compact export for the browser: nodes are line nodes, indexed in sorted order.
        node_keys = sorted({k for k in ride} | {t for ts in ride.values() for t, _ in ts}
                           | {ln for lns in board.values() for ln, _ in lns})
        node_id = {k: i for i, k in enumerate(node_keys)}
        hw_of = {ln: hw for lns in board.values() for ln, hw in lns}
        line_names = sorted(set(route_names.values()))
        graph = {
            "penalty": TRANSFER_PENALTY,
            "lines": line_names,
            "nodes": [[station_of[k[3]], line_names.index(route_names[k[1]]),
                       round(hw_of.get(k, 0), 2)] for k in node_keys],
            "rides": [[node_id[a], node_id[b], round(dur, 2)]
                      for a, outs in sorted(ride.items()) for b, dur in outs],
            "walks": sorted({(min(a, b), max(a, b), w) for a, ws in walk.items() for b, w in ws}),
        }
        return matrix, graph

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "stations.json").write_text(
        json.dumps(stations, ensure_ascii=False, indent=0), encoding="utf-8")

    matrix, graph = solve(edges, headway)
    (DATA_DIR / "matrix.json").write_text(json.dumps(matrix, separators=(",", ":")), encoding="utf-8")
    (DATA_DIR / "graph.json").write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    unreachable = sum(1 for r in matrix for v in r if v is None)
    size = ((DATA_DIR / "matrix.json").stat().st_size + (DATA_DIR / "graph.json").stat().st_size) // 1024
    print(f"{n} stations, {n * n - n} ordered pairs, {unreachable} unreachable, {size} KB")
    if unreachable:
        comp = defaultdict(list)
        for i, row in enumerate(matrix):
            comp[tuple(j for j, v in enumerate(row) if v is not None)].append(stations[i]["name"])
        for reach, names in sorted(comp.items(), key=lambda kv: len(kv[0])):
            if len(reach) < n - 1:
                print(f"  isolated group reaching {len(reach)} stations: {', '.join(names[:8])}")

    checks = [
        ("Kl Sentral", "Klcc"), ("Kl Sentral", "Kajang"), ("Klcc", "Bukit Bintang"),
        ("Batu Caves", "Kl Sentral"), ("Klang", "Kl Sentral"),
        ("Putra Heights", "Kl Sentral"), ("Sungai Buloh", "Putrajaya Sentral"),
        ("Subang Jaya", "Klcc"), ("Sunway Lagoon", "Kl Sentral"),
        ("Titiwangsa", "Perhentian Midvalley"),
    ]

    def by_name(name):
        return [i for i, s in enumerate(stations) if s["name"].lower() == name.lower()]

    print("\nSpot-check candidates (minutes from station to station incl. waits;")
    print("min over same-named stations):")
    for a, b in checks:
        ia, ib = by_name(a), by_name(b)
        if not ia or not ib:
            print(f"  {a} -> {b}: station name not found")
            continue
        print(f"  {a} -> {b}: {min(matrix[i][j] for i in ia for j in ib if matrix[i][j] is not None)}")


if __name__ == "__main__":
    main()
