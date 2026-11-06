# Checking the travel times against reality

The numbers on the map come from timetables plus a simple model (half the gap between trains as the
wait, 5 minutes per change, walks as straight-line distance x 1.3 at 4.5 km/h). Unit tests only catch
a broken build (`web/src/journeys.test.ts`); they cannot say whether the times are *right*. This is the
manual check.

## How

1. Open the site, pick the "to" station as the destination, tap the "from" area, and read the total.
2. In Google Maps (or Moovit / MyRapid PULSE), ask for transit from the same place to the same place,
   leaving on a weekday around 8:00.
3. Compare door to door. Record both in the table below.

A gap under about 20% is fine for this tool. A gap over 30% on several trips means a parameter needs
changing (walking speed or detour in `web/src/model.ts`, the transfer penalty or
`data/transfers.json` in `scripts/build_matrix.py`).

## Journeys to check

Model figures are station to station (they include the average wait) and come from the current data.

| From | To | Model (min) | Maps (min) | Notes |
|---|---|---|---|---|
| KL Sentral | KLCC | 15 | | one line, KJL |
| Titiwangsa | Bukit Bintang | 16 | | monorail |
| Subang Jaya | KL Sentral | 36 | | KJL, many stops |
| Gombak | KL Sentral | 39 | | KJL |
| Kajang | KL Sentral | 54 | | MRT then change |
| Sungai Buloh | Bukit Bintang | 43 | | MRT, one line |
| Ampang | KLCC | 34 | | LRT then change |
| Putra Heights | KL Sentral | ~60 | | longest single-line trip |
| Klang | KL Sentral | ~70 | | KTM Komuter, sparse trains |

## Known limits of the model (not bugs)

- **KTM Komuter is sparse.** Some stops have only a handful of trains a day. Waits are capped at 20
  minutes (`MAX_HEADWAY`), which is optimistic for a missed train and pessimistic for a timed arrival.
- **Networks that do not connect on foot.** Klang's KTM stations and the Sunway BRT stops can be 3 km
  apart as the crow flies with no walking transfer, so the model routes via KL. Bus links are not modelled.
- **No ERL (KLIA Ekspres / Transit) and no feeder buses.** They are not in the Prasarana or KTMB feeds
  used here. "Bike or e-hail" covers the first/last leg to a station but not a bus network.
- **Walking is straight-line x 1.3.** Highways, rivers and missing footbridges can make a real walk
  much longer than the model says.
- **Prasarana trains are generated from the published headways**, so the train view is a faithful
  picture of the timetable, not of live positions.
- **Weekday mornings only.** Weekend and evening trips have different timetables.
