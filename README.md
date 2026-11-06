# Klang Valley commute map

Pick where you work or study, and see every part of the Klang Valley you could live in and get there by train within 30, 45 or 60 minutes.

![Commute map shaded around KL Sentral, with a trip breakdown open](docs/screenshot.png)

Live site: https://anselloo.github.io/klang-valley-commute-map/ (available once GitHub Pages is switched on, see [Deploying](#deploying)).

## What it does

- Click the map (or search) for your destination. The map shades an H3 hex grid by total door-to-door travel time: under 30 min, 30–45, 45–60, and over 60.
- Click any shaded area for a breakdown: walk to the station, wait, each ride with its line and stops, changes, and the walk at the end.
- Toggle between arriving at 8:00 am and 9:00 am on a weekday.
- Drag the pin to move the destination; shading updates in a few milliseconds.

Rail only for v1: LRT, MRT, Monorail, BRT Sunway and KTM Komuter. No buses, no real-time data, no backend. See [SPEC.md](SPEC.md).

## How it works

A Python build step turns the official static GTFS feeds into small JSON files. The browser does the rest, with no server.

1. **Build** (`scripts/`): downloads the feeds, keeps weekday Klang Valley rail, merges stops within 150 m into one station, and runs a shortest-path search from every station. Cost per trip is in-vehicle time, plus half the line's average headway as the first wait, plus half the next line's headway and 5 minutes for each change. A hand-maintained list of out-of-system walking links (`data/transfers.json`) joins stations that are close but not connected in the feeds.
2. **Browser** (`web/`): for a destination D, a station's time is the best of `matrix(S, T) + walk(T, D)` over stations T within 1.5 km of D. A hex's time is the best of `walk(H, S) + time(S)` over stations S within 1.5 km. Walking is straight-line distance × 1.3 ÷ 4.5 km/h.

Two departure windows are built, one per arrival option: 6–8 am for "arrive 8:00" and 7–9 am for "arrive 9:00".

## Run it locally

Needs Python 3.9+ (standard library only) and Node 20+.

```bash
# 1. Check the raw feeds (downloads to data/raw/, which is git-ignored)
python scripts/gtfs_check.py

# 2. Rebuild data/stations.json, matrix-*.json and graph-*.json (they are committed, so this is optional)
python scripts/build_matrix.py          # add --refresh to re-download the feeds

# 3. Run the site
cd web
npm install
npm run dev                             # development server
npm test                                # unit tests
npm run build && npm run preview        # production build
```

## Layout

```
scripts/     Python build step (gtfs_check.py, build_matrix.py)
data/        generated stations.json, matrix-*.json, graph-*.json, and hand-made transfers.json
web/         Vite + TypeScript frontend (MapLibre GL JS, h3-js)
.github/     workflows: deploy to Pages, monthly data refresh
SPEC.md      the v1 spec
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes `web/` to GitHub Pages on every push to `main` that touches the site or the data. One-time setup: in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

`.github/workflows/refresh-data.yml` runs on the 1st of each month, re-downloads the feeds, rebuilds the data, and commits it if anything changed.

## Caveats

- **Estimates, not a journey planner.** Waits are half the average headway, not a real timetable lookup, and walking ignores roads and rivers.
- **Feed gaps show up.** The KTM feed has long gaps on some lines in the morning peak (for example the Port Klang line), so some KTM stations look slow. The Kelana Jaya line takes about 98 minutes end to end in the Prasarana feed.
- **Transfer walk times are guesses.** The walks in `data/transfers.json` are estimates and are worth checking on the ground.
- **KTM schedule expiry.** The KTM calendar in the feed has an end date; the monthly refresh picks up new schedules.

## Data and credits

- GTFS static feeds from Malaysia's open data portal, [developer.data.gov.my](https://developer.data.gov.my/): Prasarana (`rapid-rail-kl`) and KTMB.
- Base map: [OpenFreeMap](https://openfreemap.org/) with [OpenStreetMap](https://www.openstreetmap.org/copyright) data, rendered with [MapLibre GL JS](https://maplibre.org/).
- Search: [Nominatim](https://nominatim.org/), one request per search.
- Hex grid: [H3](https://h3geo.org/) via h3-js.
