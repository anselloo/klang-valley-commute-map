# Checking the travel times against reality

The numbers on the map come from timetables plus a simple model (half the gap between trains as the
wait, 5 minutes per change, walks as straight-line distance x 1.6 at 4.5 km/h). Unit tests only catch
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
| Putra Heights | KL Sentral | 55 | | longest single-line trip |
| Klang | KL Sentral | 81 | | KTM Komuter, sparse trains |
| KL Sentral | KLIA | 36 | | KLIA Ekspres, 28 min ride plus wait |
| KL Sentral | KLIA2 | 41 | | KLIA Ekspres |
| Putrajaya Sentral | KLIA | 24 | | KLIA Transit |

## Known limits of the model (not bugs)

- **KTM Komuter is sparse.** Some stops have only a handful of trains a day. Waits are capped at 20
  minutes (`MAX_HEADWAY`), which is optimistic for a missed train and pessimistic for a timed arrival.
- **Networks that do not connect on foot.** Klang's KTM stations and the Sunway BRT stops can be 3 km
  apart as the crow flies with no walking transfer, so the model routes via KL. Bus links are not modelled.
- **ERL is hand-entered.** KLIA Ekspres and KLIA Transit are in neither feed, so `data/erl.json` holds
  their stops (from OpenStreetMap) and the ride times and gaps from ERL's published schedule
  (kliaekspres.com, 1 Aug 2023). Transit's frequency is the least certain figure.
- **Buses:** Rapid KL's feeder and city buses are modelled only as a way of reaching a station by one
  direct bus (about 125 stations have one). Bus-to-bus changes, other operators and buses as the main
  mode of a trip are not.
- **Walking is straight-line x 1.6.** Measured against pedestrian routing (`scripts/calibrate_walking.py`)
  the median is 1.8x and the lower quartile 1.5x; one in ten spots needs more than 5x because of highways,
  rivers and missing footbridges. The model uses 1.6 on average, so those spots are still too optimistic.
- **Prasarana trains are generated from the published headways**, so the train view is a faithful
  picture of the timetable, not of live positions.
- **Four time periods:** weekday morning, weekday evening, Saturday and Sunday (each a two-hour window).
  Late-night trips are not built.
