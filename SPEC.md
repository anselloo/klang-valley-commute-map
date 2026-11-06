# Commute Map — Klang Valley (spec)

This started as the v1 spec. Sections for v2, v2.1 and v3 at the end describe what was added since; where they change something in v1, the v1 text below is marked.

## One-line pitch
Pick where you work or study, and see every part of the Klang Valley you could live in and get there by train within 30, 45 or 60 minutes.

## Who it's for
People choosing where to rent or buy who want to rely on public transport. v1 assumed a weekday morning commute; v3 adds weekday evening, Saturday and the trip home.

## What v1 does
1. Shows a map of the Klang Valley.
2. The user picks a destination: their office or campus. They can search, tap a quick pick, choose "pick a spot on the map", or drag the pin. The site opens on a worked example (KL Sentral) so the first screen already shows the result.
3. The map shades the area by total door-to-door travel time to that destination, in bands: under 30 min, 30–45, 45–60, over 60 / unreachable.
4. Clicking any shaded area shows a short breakdown: walk to station, wait, ride (with lines and transfers), walk to destination.
5. ~~A toggle to switch the arrival time between 8:00am and 9:00am on a weekday.~~ Dropped: with a 6–8am and a 7–9am window the two options differed by about a minute for a typical trip (62% of pairs within 1 min), and mostly reflected gaps in the KTM feed. It added a decision a first-time visitor cannot judge, so v1 uses a single weekday-morning window.
6. A short numbered guide in a side panel (a bottom sheet on phones) explains the steps and the legend, so a first-time visitor knows what to do.

## Explicitly NOT in v1
- Buses and MRT feeder buses (still not built: the bus feeds have thousands of stops, which this design cannot handle)
- Real-time data (static schedules are enough for "where should I live")
- User accounts, saved locations, or any backend
- Driving or e-hailing comparisons (v3 adds bike / e-hail only as a way of reaching a station)
- Mobile app; it just needs to work well in a mobile browser

## Data sources
All from Malaysia's official open GTFS API (developer.data.gov.my), static feeds only:
- `GET https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl` (LRT, MRT, Monorail, BRT)
- `GET https://api.data.gov.my/gtfs-static/ktmb` (filter to KTM Komuter routes in the Klang Valley; drop ETS/intercity)

Each returns a GTFS ZIP (stops.txt, routes.txt, trips.txt, stop_times.txt, calendar.txt, etc.).

Added since v1:
- `data/erl.json`, entered by hand: KLIA Ekspres and KLIA Transit are in neither feed. Stop positions come from OpenStreetMap; ride times and headways are approximate figures from ERL's published timetable and need re-checking.
- `data/ktm_shapes.json`: KTM Komuter track geometry from OpenStreetMap (the KTMB feed has no shapes), fetched once by `scripts/fetch_ktm_geometry.py`.
- `data/transfers.json`: hand-estimated walking links between nearby stations.

Base map: MapLibre GL JS with free vector tiles (e.g. OpenFreeMap), no API key needed.
Search box: station names matched locally, then Nominatim (light usage, at most one request a second), then Photon as a backup.
Satellite view: Esri World Imagery tiles.

## How it works

### Build step (Python, runs offline / in GitHub Actions)
1. Download both GTFS ZIPs.
2. Keep only weekday service and only Klang Valley rail routes.
3. For a departure window of 7:00–9:00am, compute the shortest station-to-station travel time for every pair of stations. (A one-hour window left some KTM stops with no trains, because the feed has real gaps; stops with no departure in the window use the window padded by an hour, then the day's average gap. v3 repeats this for weekday evening and Saturday over the same stations.) Include:
   - in-vehicle time from stop_times
   - initial wait = half the average headway on that route in the window, with the headway capped at 40 minutes
   - transfer penalty = 5 min per change (walking between platforms plus waiting)
   - known out-of-system transfers between nearby stations (e.g. a short walk between two lines' stations), as a hand-maintained list
4. Output `stations.json` (id, name, lat, lon, lines), `matrix.json` (station-to-station minutes) and `graph.json` (a compact line graph the browser uses to rebuild the route for the breakdown popup), plus `matrix-pm.json`, `graph-pm.json`, `matrix-sat.json`, `graph-sat.json` and `meta.json` (build date, timetable validity). All small enough to ship to the browser; the evening and Saturday files load only when chosen.
5. `scripts/validate_data.py` checks the result before the monthly refresh publishes it.

### In the browser (no backend)
1. User picks destination point D.
2. For every station S: time(S → D) = min over stations T within reach of D of [matrix(S, T) + access(T, D)]. (Reach is 1.5 km on foot; v3 adds 4 km by bike or e-hail. "Coming back" uses matrix(T, S) instead.)
3. Cover the region with an H3 hexagon grid (resolution 8, roughly 0.7 km² per cell).
4. For every hex H: time(H → D) = min over stations S within reach of H of [access(H, S) + time(S → D)].
5. Colour hexes by time band; hide hexes with no station in walking range.

Walking time = straight-line distance × 1.6 (detour factor) ÷ 4.5 km/h. v1 used 1.3; v3 measured real pedestrian routes on OpenStreetMap (Valhalla, 150 random spots 300 m to 1.5 km from stations: median 1.8×, lower quartile 1.47×, router speed 4.7 km/h) and raised it. The sample includes unbuilt land and highways, so the median is a ceiling for where people live; 1.6 is a compromise. By bike or e-hail: a 1.3 detour at 20 km/h plus 4 minutes, for stations beyond walking range.

## Stack
- Frontend: Vite + TypeScript, MapLibre GL JS, h3-js. No framework needed; React is fine if preferred.
- Preprocessing: Python 3, standard library only (no pandas needed at this size).
- Hosting: GitHub Pages (the whole site is static).
- Data refresh: a monthly GitHub Actions workflow re-runs the build step and commits fresh JSON.

## Repo layout
```
/scripts      Python build step (gtfs_check, build_matrix, build_network,
              fetch_ktm_geometry, validate_data)
/data         generated stations/matrix/graph/network/meta JSON (committed),
              plus the hand-maintained transfers.json and erl.json
/web          Vite frontend (src/, unit tests, e2e/ browser checks)
/docs         screenshots, VERIFY.md (how to check times against Google Maps)
/.github      workflows: deploy to Pages, monthly data refresh, browser checks
SPEC.md       this file
README.md     what it is, screenshot, how to run locally
```

## Milestones
Status as of 2026-11-07: all six are built, pushed and deployed, along with v2, v2.1, v3, v3.1 and v4. One item is still open (marked below).

1. **Data sanity check.** Script downloads both feeds, prints the list of routes and station count. Eyeball it: are all expected lines there? Are the station coordinates right? *Done.*
2. **Matrix.** Compute and save station-to-station times. Spot-check 5 trips against Google Maps or MyRapid PULSE; within ~5 min is fine. *Built; the spot-check against Google Maps / PULSE is still open (the checklist is `docs/VERIFY.md`), and the walk times in `data/transfers.json` are estimates.*
3. **Map.** Base map plus station dots, nothing else. *Done.*
4. **Isochrone.** Click a point, hexes colour by travel time. *Done.*
5. **Breakdown popup and arrival-time toggle.** *Breakdown popup done, plus search, quick picks and a first-visit guide. The arrival-time toggle was built and then removed (see "What v1 does").*
6. **Ship.** Deploy to GitHub Pages, write the README with a screenshot. *Done: deployed to https://anselloo.github.io/klang-valley-commute-map/ with the deploy workflow.*

## Done when
- I can click on KL Sentral and on a suburban office location and the shading looks believable to someone who commutes there. *Needs a commuter's judgement.*
- It loads in under 3 seconds on a phone. *Not met in testing: about 3 s on a fast connection and 6–10 s on throttled 4G with a slowed CPU, using software rendering. Check on a real phone.*
- Recomputing after a click feels instant (under ~200 ms). *Met: about 5 ms.*

## Known risks and caveats
- Feed completeness varies by operator; check milestone 1 output carefully before building further.
- Headway-based waiting is an approximation (capped at a 20 minute wait). A proper schedule-based algorithm (RAPTOR) is a possible upgrade.
- Station-to-station transfers outside the fare gates aren't in GTFS and need a hand-made list.
- Walking via straight lines ignores highways and rivers; real walking routes are a v2+ improvement.
- The KTM feed has long gaps on some lines in the morning peak (for example the Port Klang line), and the Prasarana feed gives only frequencies plus one template trip per direction. Both make some trips look slower than expected. The Kelana Jaya line is about 98 minutes end to end in the feed.
- Walk times in `data/transfers.json` are estimates and should be checked on the ground.
- The KTM calendar in the feed has an end date (20 Nov 2026 at the time of writing); the panel warns once it has passed, and the monthly refresh picks up new schedules.
- Free third-party services (Nominatim, Photon, OpenFreeMap, Esri imagery) come with no guarantee; heavy traffic could get the site throttled.

## v2: interactive train network (built)
An animated view of the rail network on the same map, as a second tab next to the commute map.

- Every train on the weekday timetable moves along its line. Prasarana lines follow the published track shape and are expanded from the published headways; KTM Komuter follows its real track, taken from OpenStreetMap because the KTMB feed has no shapes (`scripts/fetch_ktm_geometry.py` saves it to `data/ktm_shapes.json`), and uses its real trips, clipped to the Klang Valley. The build step (`scripts/build_network.py`) writes `data/network.json`.
- A clock with play/pause, 10×/60×/300× speed, a slider (05:00 to 01:00), and jumps to morning peak, midday, evening peak, late and now.
- Tap a train to see its line, destination and next stop and follow it with the camera; tap a station for its next departures (and to use it as the commute destination); tap a line to focus on it. Lines draw in when the view opens.
- Works on a phone: the bottom sheet keeps the tabs, clock, play button and a one-line summary of the selection visible when collapsed.
- Not included: real-time positions, bus services, and exact timetables for Prasarana (its trains are generated from headways).

## v2.1: base maps and design (built)
- A Map / Satellite switch. Map is the OpenFreeMap Bright style with its saturated road colours softened so transit lines and travel-time shading stand out; Satellite is Esri World Imagery under the same place labels (recoloured white with a dark halo). Both are layers of one style, so switching never rebuilds the map or loses the destination, shading or trains. The choice is remembered.
- A redesigned interface in an Apple-like style: frosted-glass panels, system colours with a blue tint, a type scale in the system font (Inter as the stand-in off Apple devices), iOS-style segmented controls with a sliding thumb, capsule buttons, grouped lists, colour-coded line badges, a bottom sheet with a grabber on phones, and automatic dark mode. Motion respects the reduced-motion setting.

## v3 and v3.1: practicality and trust (built)
Fixes from a review of the whole app. v3 was the first batch (access modes, shareable links, honest labels, wait fixes, search resilience, data checks, evening and Saturday, ERL in the commute map). v3.1 followed with feeder buses, Sunday, ERL in the train view, walking calibration against real routing, and the base-map fallback. The list below covers both.

- **Getting to a station:** Walk (1.5 km), Feeder bus, or Bike / e-hail (4 km, about 20 km/h plus 4 minutes). Shorter distances are still walked, so the second mode never gives a worse time. This addresses the main impracticality of the train-only map: most of the valley is more than 1.5 km from a station.
- **Shareable links:** the address bar holds the destination and access mode (`#to=lat,lng&name=...&via=ride`); a shared link opens on it. A "Copy a link" button sits under the legend.
- **Honesty about the data:** "Timetable data built <date>" in the panel (from `data/meta.json`), a warning once part of a timetable has expired, and a note in the network view that trains are simulated from the timetable. "Now" uses Kuala Lumpur time, and says when it is the weekend that the weekday timetable is shown.
- **Waits:** the average gap used for waits is capped at 40 minutes, and stops with no train in the morning window fall back to the day's average gap. The review's sanity tests found stops with 100+ minute waits and a Kajang to Kajang 2 hop that took 110 minutes one way and 18 the other; both are gone.
- **Search resilience:** station names are matched locally first, results are cached, requests are spaced at least 1.1 s apart, and Photon is tried when Nominatim fails.
- **Data safety:** `scripts/validate_data.py` runs in the monthly refresh before anything is committed, and fails on a large drop in stations, lines or trips, or on unreachable pairs. Browser checks live in `web/e2e/` and run in CI (`.github/workflows/e2e.yml`). Plausibility tests on real journeys, speeds and symmetry are in `web/src/journeys.test.ts`.
- **Time of day and direction:** weekday morning, weekday evening, Saturday and Sunday, each with its own matrix and graph over the same stations, and a "coming back" direction that reads the matrix the other way round.
- **Feeder buses:** Rapid KL's MRT feeder GTFS (about 90 routes, 2,000 stops, real trips) is reduced by `scripts/build_feeder.py` to the best way from each bus stop to a rail station and back, per time period (`feeder*.json`, 53 stations have feeders). The "Feeder bus" choice lets a place reach the rail network by a walk of up to 500 m to such a stop, with the wait for the bus included; the trip breakdown names the route. Other buses are still out of scope.
- **KLIA Ekspres / Transit:** entered by hand (`data/erl.json`, positions from OpenStreetMap, times and peak/off-peak gaps from ERL's published schedule), in the commute map and drawn in the train view on their OpenStreetMap track with an ERL badge.
- **Walking calibration:** the detour factor is 1.6, measured against pedestrian routing (see above); interchange walk times in `data/transfers.json` were checked the same way and four were corrected. `scripts/calibrate_walking.py` reproduces both.
- **Still to do by a person:** compare the times with Google Maps using [docs/VERIFY.md](docs/VERIFY.md) (no way to query it from the build), and re-check the ERL Transit frequency.
- **Still not covered:** rents (searched: DOSM publishes household income and expenditure by parliamentary constituency and state-level house price indices, but no rent by area; the rest is paid or scraped listings), buses other than the MRT feeders, late-night timetables, a walking link between Klang's KTM and BRT stops (they are about 3 km apart), and a fallback for satellite imagery. If the OpenFreeMap style cannot be fetched (7 s timeout) the app falls back to plain OpenStreetMap raster tiles with a notice, and everything else works.

## v4: compare two destinations (built)
For anyone with two places to reach: two workplaces, a workplace and a campus, or a workplace and family.

- Step 1 now has a Destination A / Destination B switch. Search, quick picks, "pick a spot" and pin dragging all change whichever is selected. With B set, the map shades each area by the **longer** of the two trips, so "under 45" means both commutes are under 45 minutes. Everything else (time of day, direction, how you reach a station) applies to both.
- Two pins (A red, B purple) with labels. Tapping an area shows both trips side by side under "N min for the slower trip", each with its own steps. "Use this spot" fills whichever destination is selected. "Remove destination B" goes back to one.
- The link carries both (`#to=...&name=...&to2=...&name2=...`), so the exact view can be shared.
- Combining is `slowest()` in `web/src/model.ts` over the two per-destination results, so it costs one extra recompute (a few milliseconds).
- Not included: a weighting (for example 60/40), a "sum of the two" measure, or more than two destinations.

## Later ideas (parking lot, don't build yet)
- Rapid KL city buses (the MRT feeder buses are done; the rest have thousands of stops and bus-to-bus changes)
- A weighting or "total time" option for two destinations
- Penang and Johor Bahru versions (first check the Klang Valley times against Google Maps)
- Rents were dropped: no open dataset, and the listing sites forbid scraping
