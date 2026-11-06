# Commute Map — Klang Valley (v1 spec)

## One-line pitch
Pick where you work or study, and see every part of the Klang Valley you could live in and get there by train within 30, 45 or 60 minutes.

## Who it's for
People choosing where to rent or buy who want to rely on public transport. For v1, assume a weekday morning commute.

## What v1 does
1. Shows a map of the Klang Valley.
2. The user picks a destination: their office or campus. They can search, tap a quick pick, choose "pick a spot on the map", or drag the pin. The site opens on a worked example (KL Sentral at 8:00am) so the first screen already shows the result.
3. The map shades the area by total door-to-door travel time to that destination, in bands: under 30 min, 30–45, 45–60, over 60 / unreachable.
4. Clicking any shaded area shows a short breakdown: walk to station, wait, ride (with lines and transfers), walk to destination.
5. A toggle to switch the arrival time between 8:00am and 9:00am on a weekday.
6. A short numbered guide in a side panel (a bottom sheet on phones) explains the steps and the legend, so a first-time visitor knows what to do.

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
3. For each arrival option, compute the shortest station-to-station travel time for every pair of stations, using a two-hour departure window ending at the arrival time (6:00–8:00am for "arrive 8:00", 7:00–9:00am for "arrive 9:00"). One-hour windows left some KTM stops with no trains, because the feed has real gaps. Stops with no departure in the window use the window padded by an hour. Include:
   - in-vehicle time from stop_times
   - initial wait = half the average headway on that route in the window
   - transfer penalty = 5 min per change (walking between platforms plus waiting)
   - known out-of-system transfers between nearby stations (e.g. a short walk between two lines' stations), as a hand-maintained list
4. Output `stations.json` (id, name, lat, lon, lines), a `matrix-<window>.json` per arrival option (station-to-station minutes), and a `graph-<window>.json` per option (a compact line graph the browser uses to rebuild the route for the breakdown popup). All small enough to ship to the browser.

### In the browser (no backend)
1. User picks destination point D.
2. For every station S: time(S → D) = min over stations T within 1.5 km of D of [matrix(S, T) + walk(T, D)].
3. Cover the region with an H3 hexagon grid (resolution 8, roughly 0.7 km² per cell).
4. For every hex H: time(H → D) = min over stations S within 1.5 km of H of [walk(H, S) + time(S → D)].
5. Colour hexes by time band; hide hexes with no station in walking range.

Walking time = straight-line distance × 1.3 (detour factor) ÷ 4.5 km/h. Simple and good enough for v1.

## Stack
- Frontend: Vite + TypeScript, MapLibre GL JS, h3-js. No framework needed; React is fine if preferred.
- Preprocessing: Python 3, standard library only (no pandas needed at this size).
- Hosting: GitHub Pages (the whole site is static).
- Data refresh: a monthly GitHub Actions workflow re-runs the build step and commits fresh JSON.

## Repo layout
```
/scripts      Python build step (download, filter, compute matrix)
/data         generated stations.json, matrix-*.json, graph-*.json (committed),
              plus the hand-maintained transfers.json
/web          Vite frontend
/docs         README screenshot
/.github      workflows: deploy to Pages, monthly data refresh
SPEC.md       this file
README.md     what it is, screenshot, how to run locally
```

## Milestones
Status as of 2026-11-06: all six are built and pushed. Two items are still open (marked below).

1. **Data sanity check.** Script downloads both feeds, prints the list of routes and station count. Eyeball it: are all expected lines there? Are the station coordinates right? *Done.*
2. **Matrix.** Compute and save station-to-station times. Spot-check 5 trips against Google Maps or MyRapid PULSE; within ~5 min is fine. *Built; the spot-check against Google Maps / PULSE is still open, and the walk times in `data/transfers.json` are estimates.*
3. **Map.** Base map plus station dots, nothing else. *Done.*
4. **Isochrone.** Click a point, hexes colour by travel time. *Done.*
5. **Breakdown popup and arrival-time toggle.** *Done, plus search, quick picks and a first-visit guide.*
6. **Ship.** Deploy to GitHub Pages, write the README with a screenshot. *Workflows and README are done; GitHub Pages still has to be switched on (Settings → Pages → Source: GitHub Actions).*

## Done when
- I can click on KL Sentral and on a suburban office location and the shading looks believable to someone who commutes there. *Needs a commuter's judgement.*
- It loads in under 3 seconds on a phone. *Not met in testing: about 3 s on a fast connection and 6–10 s on throttled 4G with a slowed CPU, using software rendering. Check on a real phone.*
- Recomputing after a click feels instant (under ~200 ms). *Met: about 5 ms.*

## Known risks and caveats
- Feed completeness varies by operator; check milestone 1 output carefully before building further.
- Headway-based waiting is an approximation. A proper schedule-based algorithm (RAPTOR) is a possible v2 upgrade.
- Station-to-station transfers outside the fare gates aren't in GTFS and need a hand-made list.
- Walking via straight lines ignores highways and rivers; real walking routes are a v2+ improvement.
- The KTM feed has long gaps on some lines in the morning peak (for example the Port Klang line), and the Prasarana feed gives only frequencies plus one template trip per direction. Both make some trips look slower than expected. The Kelana Jaya line is about 98 minutes end to end in the feed.
- Walk times in `data/transfers.json` are estimates and should be checked on the ground.
- The KTM calendar in the feed has an end date; the monthly refresh picks up new schedules.

## v2 ideas (parking lot, don't build yet)
- Add Rapid KL buses and MRT feeder buses
- "Compare two destinations" mode for couples with different workplaces
- Overlay rental price data
- Penang and Johor Bahru versions
