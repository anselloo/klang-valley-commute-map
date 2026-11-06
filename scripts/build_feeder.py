"""Build the bus-to-rail links in data/feeder*.json, including bus-to-bus changes.

Rapid KL publishes two bus GTFS feeds: the MRT feeder buses (about 90 routes, 2,000 stops, real trip
times) and its city buses (about 140 routes, 4,000 stops, trips given as frequencies). Putting every
bus stop into the rail matrix would swamp it, so the bus network is searched here, at build time, and
each stop is reduced to "the best ways to reach a rail station from here, and to get from a rail
station to here", allowing changes between buses:

  stop P -> station S   wait for a bus at P, ride, change buses if that is quicker, ride to a stop beside S
  station S -> stop P   the same journey the other way

The search is a shortest-path search over bus stops (a node for waiting at a stop, a node per route
and direction and stop for being on board), run backwards and forwards from every rail station:

  waiting at a stop -> on board        half the average gap between buses on that route
  on board -> on board (next stop)     ride time from the timetable
  on board -> waiting at the stop      alighting, 0.5 min
  waiting -> waiting at a stop within  the walk, plus 1 min
  150 m (a change)

Only the best few stations per stop are kept, and journeys over 75 minutes are dropped. The browser
adds a bus stop within a 500 m walk of a place to its options for reaching the rail network (the "Bus"
choice). Bus-to-train changes in the middle of a trip, and buses as the main mode of a trip, are not
modelled.

Run after build_matrix.py (it needs data/stations.json). One file per time period, like the matrices:
feeder.json, feeder-pm.json, feeder-sat.json, feeder-sun.json. Each is a list of
[lat, lon, [[station index, minutes to the station, minutes from the station, route(s) to,
route(s) from], ...]], where routes are in the order ridden, joined with " > " when there is a change.

Standard library only. Usage:  python scripts/build_feeder.py [--refresh]
"""
import argparse
import heapq
import json
import statistics
import zipfile
from collections import defaultdict

import build_matrix as bm
import gtfs_check as g

FEEDS = [
    ("mrtfeeder", "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder", g.RAW_DIR / "feeder.zip"),
    ("city", "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl", g.RAW_DIR / "bus_kl.zip"),
]
STATION_RADIUS_M = 300   # a bus stop this close to a station counts as "at the station"
ENTRANCE_MIN = 2.0       # from the bus stop into the station (or out of it)
ALIGHT_MIN = 0.5
CHANGE_WALK_M = 150      # stops this close are one place to change buses
CHANGE_PENALTY_MIN = 1.0
KEEP_STATIONS = 3        # best stations kept per bus stop
MAX_LINK_MIN = 75        # longer than this is not a practical way to reach a station
MAX_HEADWAY = bm.MAX_HEADWAY
to_min = bm.to_min

WALK_KMH = 4.5
WALK_DETOUR = 1.6        # same as the browser's walking model


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


def read_feed(prefix, zf, window, days):
    """One feed's bus network for a period: stops, ride times, gaps between buses and route names.

    Keys are prefixed with the feed name so ids from the two feeds cannot collide.
    """
    start, end = window
    stops = {f"{prefix}:{r['stop_id']}": (float(r["stop_lat"]), float(r["stop_lon"]))
             for r in g.read_table(zf, "stops.txt") if g.in_valley(r)}
    # The name shown in the trip breakdown: the route number (300, T117), else its description.
    names = {f"{prefix}:{r['route_id']}": r["route_short_name"] or r["route_long_name"]
             for r in g.read_table(zf, "routes.txt")}
    services, _ = g.services_on(g.read_table(zf, "calendar.txt"), days)
    trips = {t["trip_id"]: t for t in g.read_table(zf, "trips.txt") if t["service_id"] in services}
    seqs = defaultdict(list)
    for st in g.read_table(zf, "stop_times.txt"):
        if st["trip_id"] in trips:
            seqs[st["trip_id"]].append(st)
    freqs = defaultdict(list)
    for f in g.read_table(zf, "frequencies.txt"):
        freqs[f["trip_id"]].append(f)

    counts, wide, day = defaultdict(float), defaultdict(float), defaultdict(float)
    samples = defaultdict(list)  # (route, direction, from stop, to stop) -> ride minutes
    for tid, t in trips.items():
        rkey, direction = f"{prefix}:{t['route_id']}", t.get("direction_id", "0")
        rows = sorted(seqs.get(tid, ()), key=lambda r: int(r["stop_sequence"]))
        for a, b in zip(rows, rows[1:]):
            sa, sb = f"{prefix}:{a['stop_id']}", f"{prefix}:{b['stop_id']}"
            dur = to_min(b["arrival_time"]) - to_min(a["departure_time"])
            samples[(rkey, direction, sa, sb)].append(max(dur, 0.2))
        for r in rows:
            key = (rkey, direction, f"{prefix}:{r['stop_id']}")
            if tid in freqs:
                for f in freqs[tid]:
                    f0, f1, gap = to_min(f["start_time"]), to_min(f["end_time"]), float(f["headway_secs"]) / 60
                    day[key] += (f1 - f0) / gap
                    wide[key] += max(0, min(f1, end + bm.FALLBACK_PAD) - max(f0, start - bm.FALLBACK_PAD)) / gap
                    counts[key] += max(0, min(f1, end) - max(f0, start)) / gap
            else:
                dep = to_min(r["departure_time"])
                day[key] += 1
                if start - bm.FALLBACK_PAD <= dep < end + bm.FALLBACK_PAD:
                    wide[key] += 1
                if start <= dep < end:
                    counts[key] += 1
    ride = {k: statistics.median(v) for k, v in samples.items()}
    return stops, names, ride, headways(counts, wide, day, window)


class BusGraph:
    """Nodes are integers. Forward and reverse adjacency lists hold (other node, minutes, route name or None)."""

    def __init__(self, stops, names, ride, gaps):
        self.stops = sorted(stops)
        self.latlon = [stops[s] for s in self.stops]
        wait_node = {s: i for i, s in enumerate(self.stops)}  # waiting at the stop
        board_node = {}                                        # (route, direction, stop) -> node
        n = len(self.stops)
        for (r, d, a, b) in ride:
            for s in (a, b):
                if s in wait_node and (r, d, s) not in board_node:
                    board_node[(r, d, s)] = n
                    n += 1
        self.n = n
        self.fwd = [[] for _ in range(n)]
        self.rev = [[] for _ in range(n)]

        def edge(u, v, cost, route=None):
            self.fwd[u].append((v, cost, route))
            self.rev[v].append((u, cost, route))

        for (r, d, s), node in board_node.items():
            gap = gaps.get((r, d, s))
            if gap:
                edge(wait_node[s], node, gap / 2, names.get(r, r))
            edge(node, wait_node[s], ALIGHT_MIN)
        for (r, d, a, b), dur in ride.items():
            if (r, d, a) in board_node and (r, d, b) in board_node:
                edge(board_node[(r, d, a)], board_node[(r, d, b)], dur)

        # Changes between buses: stops within CHANGE_WALK_M of each other, found with a coarse grid.
        grid = defaultdict(list)
        for i, (lat, lon) in enumerate(self.latlon):
            grid[(round(lat * 400), round(lon * 400))].append(i)  # cells about 280 m across
        for (cx, cy), members in grid.items():
            near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in grid.get((cx + dx, cy + dy), ())]
            for i in members:
                for j in near:
                    if i != j:
                        m = g.distance_m(self.latlon[i], self.latlon[j])
                        if m <= CHANGE_WALK_M:
                            edge(i, j, m * WALK_DETOUR / (WALK_KMH * 1000 / 60) + CHANGE_PENALTY_MIN)

    def search(self, sources, backwards):
        """Shortest minutes from (or, backwards, to) the source stops; returns {stop index: (minutes, route chain)}.

        The route chain lists the buses taken, in the order they are ridden.
        """
        adj = self.rev if backwards else self.fwd
        dist, chain = {}, {}
        heap = []
        for s in sources:
            dist[s] = ENTRANCE_MIN
            chain[s] = ()
            heapq.heappush(heap, (ENTRANCE_MIN, s))
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            for v, cost, route in adj[u]:
                nd = d + cost
                if nd > MAX_LINK_MIN or nd >= dist.get(v, 1e9):
                    continue
                if route is not None and chain[u] and route == chain[u][0 if backwards else -1]:
                    continue  # boarding the same route again (a U-turn on a loop) is never a sensible change
                dist[v] = nd
                if route is None:
                    chain[v] = chain[u]
                elif backwards:
                    chain[v] = (route,) + chain[u]   # boarding this bus comes before the rest of the journey
                else:
                    chain[v] = chain[u] + (route,)   # the journey so far, then this bus
                heapq.heappush(heap, (nd, v))
        return {u: (d, chain[u]) for u, d in dist.items() if u < len(self.stops)}


def build(feeds, stations, window, days):
    stops, names, ride, gaps = {}, {}, {}, {}
    for prefix, path in feeds:
        with zipfile.ZipFile(path) as zf:
            s, n, r, h = read_feed(prefix, zf, window, days)
        stops.update(s)
        names.update(n)
        ride.update(r)
        gaps.update(h)
    graph = BusGraph(stops, names, ride, gaps)

    best = defaultdict(dict)  # stop index -> station -> [minutes to, minutes from, chain to, chain from]
    for si, st in enumerate(stations):
        beside = [i for i, ll in enumerate(graph.latlon) if g.distance_m(ll, (st["lat"], st["lon"])) <= STATION_RADIUS_M]
        if not beside:
            continue
        for backwards, slot in ((True, 0), (False, 1)):
            for stop, (minutes, chain) in graph.search(beside, backwards).items():
                if not chain:
                    continue  # just walking to the station: the browser already has that
                entry = best[stop].setdefault(si, [None, None, "", ""])
                entry[slot] = minutes
                entry[slot + 2] = " > ".join(chain)

    out = []
    for stop, links in best.items():
        usable = sorted(((si, v) for si, v in links.items() if v[0] is not None and v[1] is not None),
                        key=lambda kv: kv[1][0])
        if usable:
            lat, lon = graph.latlon[stop]
            out.append([round(lat, 5), round(lon, 5),
                        [[si, round(v[0], 1), round(v[1], 1), v[2], v[3]] for si, v in usable[:KEEP_STATIONS]]])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-download the feeds")
    args = ap.parse_args()
    for _, url, path in FEEDS:
        g.download(url, path, args.refresh)
    stations = json.loads((bm.DATA_DIR / "stations.json").read_text(encoding="utf-8"))
    feeds = [(prefix, path) for prefix, _, path in FEEDS]
    for name, window, days, suffix in bm.PERIODS:
        data = build(feeds, stations, window, days)
        out = bm.DATA_DIR / f"feeder{suffix}.json"
        out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        linked = len({link[0] for row in data for link in row[2]})
        changes = sum(1 for row in data for link in row[2] if ">" in link[3] or ">" in link[4])
        print(f"{name}: {len(data)} bus stops reach {linked} stations ({changes} links change buses), {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
