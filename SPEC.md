# Commute Map — Klang Valley (v1 spec)

## One-line pitch
Pick where you work or study, and see every part of the Klang Valley you could live in and get there by train within 30, 45 or 60 minutes.

## Who it's for
People choosing where to rent or buy who want to rely on public transport. For v1, assume a weekday morning commute.

## What v1 does
1. Shows a map of the Klang Valley.
2. The user clicks (or searches) a destination: their office or campus.
3. The map shades the area by total door-to-door travel time to that destination, in bands: under 30 min, 30–45, 45–60, over 60 / unreachable.
4. Clicking any shaded area shows a short breakdown: walk to station, wait, ride (with lines and transfers), walk to destination.
5. A toggle to switch the arrival time between 8:00am and 9:00am on a weekday.

## Explicitly NOT in v1
- Buses and MRT feeder buses (v2 — they add a lot of complexity)
- Real-time data (static schedules are enough for "where should I live")
- User accounts, saved locations, or any backend
- Driving or e-hailing comparisons
- Mobile app; it just needs to work well in a mobile browser

## Data sources
All from Malaysia's official open GTFS API (developer.data.gov.my), static feeds only:
- `GET https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl` (LRT, MRT, Monorail, BRT)
- `GET https://api.data.gov.my/gtfs-static/ktmb` (filter to KTM Komuter routes in the Klang Valley; drop ETS/intercity)

Each returns a GTFS ZIP (stops.txt, routes.txt, trips.txt, stop_times.txt, calendar.txt, etc.).

Base map: MapLibre GL JS with free vector tiles (e.g. OpenFreeMap), no API key needed.
Geocoding for the search box (optional in v1): Nominatim, with light usage and a proper User-Agent.

## How it works

### Build step (Python, runs offline / in GitHub Actions)
1. Download both GTFS ZIPs.
2. Keep only weekday service and only Klang Valley rail routes.
3. For a departure window of 7:00–9:00am, compute the shortest station-to-station travel time for every pair of stations, including:
   - in-vehicle time from stop_times
   - initial wait = half the average headway on that route in the window
   - transfer penalty = 5 min per change (walking between platforms plus waiting)
   - known out-of-system transfers between nearby stations (e.g. a short walk between two lines' stations), as a hand-maintained list
4. Output `stations.json` (id, name, lat, lon, lines) and `matrix.json` (station-to-station minutes), small enough to ship to the browser.

### In the browser (no backend)
1. User picks destination point D.
2. For every station S: time(S → D) = min over stations T within 1.5 km of D of [matrix(S, T) + walk(T, D)].
3. Cover the region with an H3 hexagon grid (resolution 8, roughly 0.7 km² per cell).
4. For every hex H: time(H → D) = min over stations S within 1.5 km of H of [walk(H, S) + time(S → D)].
5. Colour hexes by time band; hide hexes with no station in walking range.

Walking time = straight-line distance × 1.3 (detour factor) ÷ 4.5 km/h. Simple and good enough for v1.

## Stack
- Frontend: Vite + TypeScript, MapLibre GL JS, h3-js. No framework needed; React is fine if preferred.
- Preprocessing: Python 3 with pandas (or gtfs-kit).
- Hosting: GitHub Pages (the whole site is static).
- Data refresh: a monthly GitHub Actions workflow re-runs the build step and commits fresh JSON.

## Repo layout
```
/scripts      Python build step (download, filter, compute matrix)
/data         generated stations.json, matrix.json (committed)
/web          Vite frontend
/.github      workflows: deploy to Pages, monthly data refresh
SPEC.md       this file
README.md     what it is, screenshot, how to run locally
```

## Milestones
1. **Data sanity check.** Script downloads both feeds, prints the list of routes and station count. Eyeball it: are all expected lines there? Are the station coordinates right?
2. **Matrix.** Compute and save station-to-station times. Spot-check 5 trips against Google Maps or MyRapid PULSE; within ~5 min is fine.
3. **Map.** Base map plus station dots, nothing else.
4. **Isochrone.** Click a point, hexes colour by travel time.
5. **Breakdown popup and arrival-time toggle.**
6. **Ship.** Deploy to GitHub Pages, write the README with a screenshot.

## Done when
- I can click on KL Sentral and on a suburban office location and the shading looks believable to someone who commutes there.
- It loads in under 3 seconds on a phone.
- Recomputing after a click feels instant (under ~200 ms).

## Known risks and caveats
- Feed completeness varies by operator; check milestone 1 output carefully before building further.
- Headway-based waiting is an approximation. A proper schedule-based algorithm (RAPTOR) is a possible v2 upgrade.
- Station-to-station transfers outside the fare gates aren't in GTFS and need a hand-made list.
- Walking via straight lines ignores highways and rivers; real walking routes are a v2+ improvement.

## v2 ideas (parking lot, don't build yet)
- Add Rapid KL buses and MRT feeder buses
- "Compare two destinations" mode for couples with different workplaces
- Overlay rental price data
- Penang and Johor Bahru versions

