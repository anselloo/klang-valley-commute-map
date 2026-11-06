"""Sanity-check the generated data before it is published.

Run after build_matrix.py and build_network.py. Exits non-zero (so the monthly refresh does not
commit or deploy) when the new data looks broken: far fewer stations or lines than before, a
matrix with many more unreachable pairs, or a network with no trains.

Absolute checks always run. When the data is in a git checkout, the new files are also compared with
the version at HEAD.

Standard library only. Usage:  python scripts/validate_data.py
"""
import json
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
MIN_STATIONS = 150
MIN_LINES = 8
MAX_DROP = 0.10  # more than 10% fewer stations / trains than the committed data is suspicious
MAX_UNREACHABLE = 0.02  # share of ordered station pairs with no route


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def committed(name):
    """The committed copy of a data file, or None outside a git checkout / for a new file."""
    try:
        out = subprocess.run(
            ["git", "show", f"HEAD:data/{name}"], cwd=DATA, capture_output=True, check=True
        ).stdout
        return json.loads(out)
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        return None


def trip_count(network):
    return len(network["trips"])


def main():
    problems = []
    stations = load("stations.json")
    matrix = load("matrix.json")
    network = load("network.json")
    n = len(stations)

    if n < MIN_STATIONS:
        problems.append(f"only {n} stations (expected at least {MIN_STATIONS})")
    if len(matrix) != n or any(len(r) != n for r in matrix):
        problems.append("matrix is not stations x stations")
    pairs = n * n - n
    unreachable = sum(1 for i, r in enumerate(matrix) for j, v in enumerate(r) if i != j and v is None)
    if pairs and unreachable / pairs > MAX_UNREACHABLE:
        problems.append(f"{unreachable} of {pairs} station pairs have no route ({unreachable / pairs:.1%})")
    if any(v is not None and not 0 < v < 240 for r in matrix for v in r if v != 0):
        problems.append("matrix has travel times outside 0-240 minutes")

    for name in ("matrix-pm.json", "matrix-sat.json", "matrix-sun.json"):
        extra = load(name)
        if len(extra) != n or any(len(r) != n for r in extra):
            problems.append(f"{name} is not stations x stations")
        gaps = sum(1 for i, r in enumerate(extra) for j, v in enumerate(r) if i != j and v is None)
        if pairs and gaps / pairs > MAX_UNREACHABLE:
            problems.append(f"{name}: {gaps} of {pairs} station pairs have no route")

    for name in ("feeder.json", "feeder-pm.json", "feeder-sat.json", "feeder-sun.json"):
        feeder = load(name)
        if len(feeder) < 5000:
            problems.append(f"{name} has only {len(feeder)} bus stops (expected over 5000)")
        elif any(link[0] >= n for row in feeder for link in row[2]):
            problems.append(f"{name} points at a station that does not exist")

    lines = len(network["lines"])
    if lines < MIN_LINES:
        problems.append(f"only {lines} lines in network.json (expected at least {MIN_LINES})")
    trips = trip_count(network)
    if trips == 0:
        problems.append("network.json has no trips")
    if any(l.get("shape") is None for l in network["lines"]):
        problems.append("a line has no track shape")

    old_stations = committed("stations.json")
    if old_stations and n < len(old_stations) * (1 - MAX_DROP):
        problems.append(f"stations dropped from {len(old_stations)} to {n}")
    old_net = committed("network.json")
    if old_net:
        if lines < len(old_net["lines"]):
            problems.append(f"lines dropped from {len(old_net['lines'])} to {lines}")
        old_trips = trip_count(old_net)
        if old_trips and trips < old_trips * (1 - MAX_DROP):
            problems.append(f"trips dropped from {old_trips} to {trips}")

    print(f"{n} stations, {lines} lines, {trips} trips, {unreachable} unreachable pairs")
    if problems:
        print("DATA CHECK FAILED:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("Data check passed.")


if __name__ == "__main__":
    main()
