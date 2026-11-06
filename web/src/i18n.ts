/**
 * Text for the two languages the site speaks: English and Bahasa Melayu.
 *
 * Every visible string lives here. `t("key", { name: value })` looks it up in the current language
 * and fills {name} placeholders; static markup uses data-i18n attributes (see applyStatic). The
 * Bahasa Melayu text must have exactly the keys of the English text, which TypeScript checks, and
 * the tests also check that the placeholders match. Switching language reloads the page: the link
 * (destinations, options, shortlist) already carries all the state.
 */
export type Lang = "en" | "ms";

const EN = {
  // Page
  "page.title": "Where can I live? Klang Valley commute map",
  "page.description": "See which parts of the Klang Valley are within 30, 45 or 60 minutes by train of your office or campus, and watch the trains run.",
  "app.title": "Where can I live?",
  "app.loading": "Loading…",
  "lang.switch": "Bahasa Melayu",
  "lang.switch.short": "BM",

  // Base map and panel
  "basemap.aria": "Map type",
  "basemap.map": "Map",
  "basemap.satellite": "Satellite",
  "panel.aria": "Controls",
  "grabber.aria": "Expand or collapse the panel",
  "collapse.hide": "Hide",
  "collapse.options": "Options",
  "modes.aria": "View",
  "modes.commute": "Commute map",
  "modes.network": "Train network",

  // Commute view: intro and step 1
  "lede": "Pick where you work or study. The map colours every area by how long the train journey to it takes, door to door.",
  "s1.title": "Where do you work or study?",
  "slots.aria": "Which destination you are choosing",
  "slot.a": "Destination A",
  "slot.b": "Destination B",
  "slot.b.add": "Add a second (B)",
  "slot.note.set": "Choosing destination {slot}: {label}. Search, tap a quick pick, pick a spot or drag its pin to change it.",
  "slot.note.b": "Choose a second place you need to get to. The map then shows the longer of the two commutes.",
  "slot.note.a": "Search, tap a quick pick or pick a spot on the map.",
  "slot.status.b": "Now choose destination B: search, tap a quick pick or pick a spot on the map.",
  "remove.b": "Remove destination B",
  "measure.aria": "How to combine the two trips",
  "measure.worst": "Longer trip",
  "measure.average": "Average trip",
  "measure.note.worst": "Each area is shaded by whichever trip takes longer, so a colour means both trips are at least that good.",
  "measure.note.average": "Each area is shaded by the average trip, counting each destination by how often you go. Set a weight to 0 to ignore it.",
  "weights.text": "trips a week",
  "search.placeholder": "Search a place or address",
  "search.aria": "Search for a place or address",
  "search.button": "Search",
  "chips.aria": "Quick picks",
  "pick.default": "Or pick a spot on the map",
  "pick.cancel": "Tap the map to place it (cancel)",
  "pin.label": "Destination",
  "pin.drag": "Drag to move this destination.",
  "pin.near": "your pin near {station}",
  "pick.status.dest": "Tap anywhere on the map to place your destination.",
  "pick.status.cand": "Tap anywhere on the map to add a place you are considering.",

  // Step 2: access
  "s2.title": "How do you get to a station?",
  "access.aria": "How you get to a station",
  "access.walk": "Walk",
  "access.bus": "Bus",
  "access.ride": "Bike or e-hail",
  "access.note.walk": "Stations within a 1.5 km walk, at 4.5 km/h.",
  "access.note.bus": "A walk of up to 1.5 km to a station, or up to 500 m to a Rapid KL bus stop (feeder or city route) with a bus to one, changing buses if that is quicker. Includes the wait for each bus.",
  "access.note.ride": "Walk to stations up to 1.5 km away; beyond that, a bike, scooter or e-hailed car up to 4 km at about 20 km/h, plus 4 minutes to get going.",
  "reach.walk": "a 1.5 km walk",
  "reach.bus": "a 1.5 km walk or a bus",
  "reach.ride": "a 4 km ride",
  "verb.walk": "Walk",
  "verb.ride": "Walk or e-hail",

  // Step 3: when and direction
  "s3.title": "When, and which way?",
  "when.aria": "When you travel",
  "when.am": "Morning",
  "when.pm": "Evening",
  "when.sat": "Sat",
  "when.sun": "Sun",
  "dir.aria": "Direction of travel",
  "dir.to": "Going there",
  "dir.from": "Coming back",
  "dir.to.word": "to",
  "dir.from.word": "from",
  "when.label.am": "weekday morning",
  "when.label.pm": "weekday evening",
  "when.label.sat": "Saturday",
  "when.label.sun": "Sunday",
  "when.hours.am": "Weekday morning (trains departing 7–9 am)",
  "when.hours.pm": "Weekday evening (trains departing 5–7:30 pm)",
  "when.hours.sat": "Saturday (trains departing 10 am–12 pm)",
  "when.hours.sun": "Sunday (trains departing 10 am–12 pm)",
  "when.note.to": "{hours}. Pick \"coming back\" to see the trip home instead.",
  "when.note.from": "{hours}. Shows how long the trip takes from your destination to each area, for example the trip home.",

  // Step 4: read the map
  "s4.title": "Read the map",
  "legend.default": "Time from each area to your destination:",
  "legend.to": "Time from each area to {names}:",
  "legend.from": "Time from {names} to each area:",
  "legend.worst": "The longer of the two trips, {dir} {names}:",
  "legend.average": "The average of the two trips, weighted by trips a week, {dir} {names}:",
  "band.u30": "Under 30 min",
  "band.30": "30–45 min",
  "band.45": "45–60 min",
  "band.o60": "Over 60 min",
  "s4.tap": "<strong>Tap a coloured area</strong> to see the trip: walk, train, changes. Uncoloured areas have no station within reach.",
  "share.button": "Copy a link to this map",
  "share.done": "Link copied",
  "share.fail": "Copy the address from your browser's address bar to share this map.",

  // Step 5 and 6
  "s5.title": "Compare places you are considering",
  "s5.note": "Add a few addresses or spots to see each one's commute at a glance. They are saved in the link.",
  "cand.placeholder": "Add an address or place",
  "cand.aria": "Add a place you are considering",
  "cand.add": "Add",
  "cand.pick": "Or tap the map to add one",
  "cand.pick.cancel": "Tap the map to add it (cancel)",
  "cand.list.aria": "Places you are considering",
  "cand.remove.aria": "Remove {name}",
  "cand.max": "You can compare up to {n} places. Remove one to add another.",
  "cand.added": "Added {label}.",
  "cand.down": "Search is unavailable right now. Tap the map to add a place instead.",
  "s6.title": "Best stations to live near",
  "rank.measure.worst": "(the longer trip)",
  "rank.measure.average": "(average trip)",
  "rank.note.two": "Minutes {measure} between the station and both destinations, not counting getting to the station. Add a few minutes for the walk or ride to it.",
  "rank.note.one": "Minutes between the station and your destination, not counting getting to the station. Add a few minutes for the walk or ride to it.",
  "calc.summary": "How is this calculated?",
  "calc.body": "Train times come from the official LRT, MRT, Monorail, BRT, KTM Komuter and KLIA Ekspres/Transit timetables. Waiting is half the average gap between trains (at most 20 minutes), each change adds 5 minutes, and walking is estimated at 4.5 km/h along a route 60% longer than the straight line. Rapid KL buses can get you to a station if you choose Bus. Treat results as a guide, not a journey planner.",

  // Summary, status, popups
  "names.and": "and",
  "or": "or",
  "min": "{n} min",
  "no.route": "no route",
  "sum.single": "Train time {dir} {names}, {when}",
  "sum.worst": "Slower commute {dir} {names}, {when}",
  "sum.average": "Average commute {dir} {names}, {when}",
  "peek.example": "Example destination. Tap Options to choose your own.",
  "peek.tip": "Tap a coloured area to see the trip. Tap Options to change the destination.",
  "status.stranded": "No station within {reach} of destination {which}, so nothing is reachable by train from it. Try somewhere closer to a station.",
  "status.tap.two": "Tap a coloured area to see both trips from there.",
  "status.tap.one": "Tap a coloured area to see how you would get there.",
  "status.nohit": "Tap a coloured area for its trip. To move your destination, search, use a quick pick, or choose \"pick a spot on the map\".",
  "status.example": "This is an example. Change the destination in step 1 to see your own commute.",
  "status.searching": "Searching…",
  "status.nomatch": "No match for \"{q}\" in the Klang Valley. Try a nearby landmark or station name.",
  "status.searchdown": "Search is unavailable right now. Use a quick pick or tap the map instead.",
  "base.fallback": "The detailed base map service is not responding, so a simpler map is shown; everything else works as usual.",
  "err.title": "Something went wrong",
  "err.start": "Failed to start: {msg}",
  "net.err": "Could not load the train timetable. Try again later.",
  "data.built": "Timetable data built {date}.",
  "data.expired": "Part of this timetable has expired, so some times may be out of date.",
  "data.bus": "Bus routes change often: Rapid KL has been converting low-use routes to on-demand service (19 in January 2026, 10 more in February), and on-demand service is not modelled.",
  "data.bus.valid": "Feeder bus timetable valid to {f}, city buses to {c}.",
  "trip.to": "from here to {label}",
  "trip.from": "from {label} to here",
  "trip.slower": "{n} min for the slower trip",
  "trip.average": "{n} min on average per trip",
  "trip.noroute": "No route",
  "trip.noroute.body": "Not reachable by train from here.",
  "trip.noroute.one": "No route to one of the destinations from here.",
  "trip.here": "this spot",
  "popup.note": "{hours}. Walks and rides to stations are straight-line estimates; waits are half the average gap between trains.",
  "popup.use.slot": "Use this spot as destination {slot}",
  "popup.use.my": "Use this spot as my destination",
  "bus.board.one": "Walk, then bus {r}",
  "bus.board.many": "Walk, then buses {r}",
  "bus.alight.one": "Bus {r}, then walk",
  "bus.alight.many": "Buses {r}, then walk",
  "bus.sep": ", then ",

  // Trip breakdown
  "bd.to": "{verb} to {name}",
  "bd.wait": "Wait for {line}",
  "bd.ride": "Ride {line}: {from} → {to} ({stops})",
  "bd.stops.one": "1 stop",
  "bd.stops.many": "{n} stops",
  "bd.bus.one": "Bus {r}: {from} → {to}",
  "bd.bus.many": "Buses {r}: {from} → {to}",
  "bd.walk.between": "Walk between stations: {from} → {to}",
  "bd.change": "Change at {station}",
  "bd.total": "Total",

  // Train network view
  "net.lede": "Every train on the weekday timetable, moving along its line. Tap a train to follow it, or a station to see what leaves next.",
  "net.note": "Simulated from the published timetable, not live positions. Prasarana trains are spaced by the timetable's average gap, so a real train can be a few minutes off.",
  "net.weekend": "It is the weekend in Malaysia, but this shows the weekday timetable.",
  "net.slider.aria": "Time of day",
  "net.speed.aria": "Playback speed",
  "net.jumps.aria": "Jump to a time of day",
  "net.jump.am": "Morning peak",
  "net.jump.mid": "Midday",
  "net.jump.pm": "Evening peak",
  "net.jump.late": "Late",
  "net.jump.now": "Now",
  "net.pause": "Pause",
  "net.play": "Play",
  "net.pause.aria": "Pause trains",
  "net.play.aria": "Play trains",
  "net.count": "{n} trains running",
  "net.count.none": "No trains running yet",
  "net.peek": "Tap a train to follow it, or a station for departures.",
  "net.card.none": "Nothing selected. Tap a train or a station on the map.",
  "net.finished": "That trip has finished its run.",
  "net.stopped": "Stopped at <strong>{name}</strong>",
  "net.next": "Next: <strong>{name}</strong> in {when}",
  "net.peek.stopped": "{line} to {dest}: stopped at {name}",
  "net.peek.next": "{line} to {dest}: next {name} in {when}",
  "net.follow": "Follow this train",
  "net.unfollow": "Stop following",
  "net.close": "Close",
  "net.to": "to {name}",
  "net.deps": "Next departures",
  "net.deps.none": "No departures in the next 40 minutes at this time of day.",
  "net.peek.nodeps": "{name}: no departures in the next 40 minutes",
  "net.usedest": "Use as my destination",
  "net.lines": "Lines",
  "net.lines.tip": "Tap a line to focus on it, tap it again to show everything.",
  "net.now": "now",
  "net.min1": "1 min",
} as const;

export type Key = keyof typeof EN;

const MS: Record<Key, string> = {
  "page.title": "Di mana saya boleh tinggal? Peta ulang‑alik Lembah Klang",
  "page.description": "Lihat kawasan di Lembah Klang yang boleh sampai ke pejabat atau kampus anda dalam 30, 45 atau 60 minit dengan tren, dan lihat tren bergerak.",
  "app.title": "Di mana saya boleh tinggal?",
  "app.loading": "Memuatkan…",
  "lang.switch": "English",
  "lang.switch.short": "EN",

  "basemap.aria": "Jenis peta",
  "basemap.map": "Peta",
  "basemap.satellite": "Satelit",
  "panel.aria": "Kawalan",
  "grabber.aria": "Kembangkan atau kecilkan panel",
  "collapse.hide": "Tutup",
  "collapse.options": "Pilihan",
  "modes.aria": "Paparan",
  "modes.commute": "Peta ulang‑alik",
  "modes.network": "Rangkaian tren",

  "lede": "Pilih tempat anda bekerja atau belajar. Peta ini mewarnakan setiap kawasan mengikut tempoh perjalanan tren dari kawasan itu ke destinasi anda, dari pintu ke pintu.",
  "s1.title": "Di mana anda bekerja atau belajar?",
  "slots.aria": "Destinasi yang sedang dipilih",
  "slot.a": "Destinasi A",
  "slot.b": "Destinasi B",
  "slot.b.add": "Tambah destinasi B",
  "slot.note.set": "Sedang memilih destinasi {slot}: {label}. Untuk mengubahnya, gunakan carian, pilihan pantas, pilih lokasi pada peta atau seret pinnya.",
  "slot.note.b": "Pilih tempat kedua yang perlu anda tuju. Peta akan menunjukkan perjalanan yang lebih lama antara kedua-duanya.",
  "slot.note.a": "Gunakan carian, pilihan pantas atau pilih lokasi pada peta.",
  "slot.status.b": "Sekarang pilih destinasi B: gunakan carian, pilihan pantas atau pilih lokasi pada peta.",
  "remove.b": "Alih keluar destinasi B",
  "measure.aria": "Cara menggabungkan dua perjalanan",
  "measure.worst": "Perjalanan lebih lama",
  "measure.average": "Purata perjalanan",
  "measure.note.worst": "Setiap kawasan diwarnakan mengikut perjalanan yang lebih lama, jadi warna itu bermakna kedua-dua perjalanan tidak melebihi tempoh tersebut.",
  "measure.note.average": "Setiap kawasan diwarnakan mengikut purata kedua-dua perjalanan, berdasarkan kekerapan anda ke setiap destinasi. Masukkan 0 untuk mengabaikan sesuatu destinasi.",
  "weights.text": "kali seminggu",
  "search.placeholder": "Cari tempat atau alamat",
  "search.aria": "Cari tempat atau alamat",
  "search.button": "Cari",
  "chips.aria": "Pilihan pantas",
  "pick.default": "Atau pilih lokasi pada peta",
  "pick.cancel": "Tekan pada peta untuk meletakkannya (batalkan)",
  "pin.label": "Destinasi",
  "pin.drag": "Seret untuk mengalihkan destinasi ini.",
  "pin.near": "pin anda berhampiran {station}",
  "pick.status.dest": "Tekan di mana-mana pada peta untuk meletakkan destinasi anda.",
  "pick.status.cand": "Tekan di mana-mana pada peta untuk menambah tempat yang sedang anda pertimbangkan.",

  "s2.title": "Bagaimana anda pergi ke stesen?",
  "access.aria": "Cara anda pergi ke stesen",
  "access.walk": "Jalan kaki",
  "access.bus": "Bas",
  "access.ride": "Basikal/e-hailing",
  "access.note.walk": "Stesen dalam lingkungan 1.5 km berjalan kaki, pada kelajuan 4.5 km/j.",
  "access.note.bus": "Berjalan kaki hingga 1.5 km ke stesen, atau hingga 500 m ke perhentian bas Rapid KL (bas perantara atau bas bandar) yang ada bas ke stesen, termasuk bertukar bas jika lebih cepat. Masa menunggu setiap bas diambil kira.",
  "access.note.ride": "Berjalan kaki ke stesen dalam lingkungan 1.5 km; lebih jauh daripada itu, menaiki basikal, skuter atau kereta e-hailing hingga 4 km pada kira-kira 20 km/j, serta 4 minit untuk memulakan perjalanan.",
  "reach.walk": "1.5 km berjalan kaki",
  "reach.bus": "1.5 km berjalan kaki atau perjalanan bas",
  "reach.ride": "4 km",
  "verb.walk": "Berjalan kaki",
  "verb.ride": "Berjalan kaki atau naik e-hailing",

  "s3.title": "Bila, dan ke arah mana?",
  "when.aria": "Waktu perjalanan",
  "when.am": "Pagi",
  "when.pm": "Petang",
  "when.sat": "Sabtu",
  "when.sun": "Ahad",
  "dir.aria": "Arah perjalanan",
  "dir.to": "Pergi",
  "dir.from": "Pulang",
  "dir.to.word": "ke",
  "dir.from.word": "dari",
  "when.label.am": "pagi hari bekerja",
  "when.label.pm": "petang hari bekerja",
  "when.label.sat": "Sabtu",
  "when.label.sun": "Ahad",
  "when.hours.am": "Pagi hari bekerja (tren bertolak 7–9 pagi)",
  "when.hours.pm": "Petang hari bekerja (tren bertolak 5–7.30 petang)",
  "when.hours.sat": "Sabtu (tren bertolak 10 pagi–12 tengah hari)",
  "when.hours.sun": "Ahad (tren bertolak 10 pagi–12 tengah hari)",
  "when.note.to": "{hours}. Pilih \"Pulang\" untuk melihat perjalanan pulang.",
  "when.note.from": "{hours}. Menunjukkan tempoh perjalanan dari destinasi anda ke setiap kawasan, contohnya perjalanan pulang dari tempat kerja.",

  "s4.title": "Cara membaca peta",
  "legend.default": "Masa dari setiap kawasan ke destinasi anda:",
  "legend.to": "Masa dari setiap kawasan ke {names}:",
  "legend.from": "Masa dari {names} ke setiap kawasan:",
  "legend.worst": "Perjalanan yang lebih lama, {dir} {names}:",
  "legend.average": "Purata kedua-dua perjalanan mengikut kekerapan seminggu, {dir} {names}:",
  "band.u30": "Bawah 30 min",
  "band.30": "30–45 min",
  "band.45": "45–60 min",
  "band.o60": "Lebih 60 min",
  "s4.tap": "<strong>Tekan kawasan berwarna</strong> untuk melihat butiran perjalanan: berjalan kaki, tren dan pertukaran tren. Kawasan tanpa warna tidak mempunyai stesen yang boleh dicapai.",
  "share.button": "Salin pautan peta ini",
  "share.done": "Pautan telah disalin",
  "share.fail": "Salin alamat daripada bar alamat pelayar anda untuk berkongsi peta ini.",

  "s5.title": "Bandingkan tempat yang anda pertimbangkan",
  "s5.note": "Tambah beberapa alamat atau lokasi untuk melihat tempoh perjalanan setiap satu sepintas lalu. Senarai ini disimpan dalam pautan.",
  "cand.placeholder": "Tambah alamat atau tempat",
  "cand.aria": "Tambah tempat yang anda pertimbangkan",
  "cand.add": "Tambah",
  "cand.pick": "Atau tekan pada peta untuk menambah tempat",
  "cand.pick.cancel": "Tekan pada peta untuk menambahnya (batalkan)",
  "cand.list.aria": "Tempat yang anda pertimbangkan",
  "cand.remove.aria": "Alih keluar {name}",
  "cand.max": "Anda boleh membandingkan sehingga {n} tempat. Alih keluar satu tempat untuk menambah yang lain.",
  "cand.added": "{label} telah ditambah.",
  "cand.down": "Carian tidak tersedia buat masa ini. Tekan pada peta untuk menambah tempat.",
  "s6.title": "Kawasan stesen terbaik untuk tinggal",
  "rank.measure.worst": "(perjalanan lebih lama)",
  "rank.measure.average": "(purata perjalanan)",
  "rank.note.two": "Minit {measure} antara stesen dan kedua-dua destinasi, tidak termasuk perjalanan ke stesen. Tambah beberapa minit untuk berjalan kaki atau menaiki kenderaan ke stesen.",
  "rank.note.one": "Minit antara stesen dan destinasi anda, tidak termasuk perjalanan ke stesen. Tambah beberapa minit untuk berjalan kaki atau menaiki kenderaan ke stesen.",
  "calc.summary": "Bagaimana ini dikira?",
  "calc.body": "Masa tren diambil daripada jadual rasmi LRT, MRT, Monorel, BRT, KTM Komuter serta KLIA Ekspres dan KLIA Transit. Masa menunggu dikira sebagai separuh daripada purata selang masa antara tren (paling lama 20 minit), setiap pertukaran tren menambah 5 minit, dan berjalan kaki dianggarkan pada 4.5 km/j melalui laluan 60% lebih panjang daripada garis lurus. Jika anda memilih Bas, bas Rapid KL juga boleh membawa anda ke stesen. Gunakan hasil ini sebagai panduan, bukan sebagai perancang perjalanan.",

  "names.and": "dan",
  "or": "atau",
  "min": "{n} min",
  "no.route": "tiada laluan",
  "sum.single": "Masa perjalanan tren {dir} {names}, {when}",
  "sum.worst": "Perjalanan ulang‑alik yang lebih lama {dir} {names}, {when}",
  "sum.average": "Purata perjalanan ulang‑alik {dir} {names}, {when}",
  "peek.example": "Ini destinasi contoh. Tekan Pilihan untuk memilih destinasi anda sendiri.",
  "peek.tip": "Tekan kawasan berwarna untuk melihat perjalanan. Tekan Pilihan untuk menukar destinasi.",
  "status.stranded": "Tiada stesen dalam lingkungan {reach} dari destinasi {which}, jadi tiada kawasan yang boleh dihubungkan dengan tren. Cuba lokasi yang lebih dekat dengan stesen.",
  "status.tap.two": "Tekan kawasan berwarna untuk melihat kedua-dua perjalanan dari kawasan itu.",
  "status.tap.one": "Tekan kawasan berwarna untuk melihat cara ke sana.",
  "status.nohit": "Tekan kawasan berwarna untuk melihat perjalanannya. Untuk menukar destinasi, gunakan carian, pilihan pantas atau butang \"pilih lokasi pada peta\".",
  "status.example": "Ini hanya contoh. Tukar destinasi di langkah 1 untuk melihat perjalanan ulang‑alik anda sendiri.",
  "status.searching": "Sedang mencari…",
  "status.nomatch": "Tiada hasil untuk \"{q}\" di Lembah Klang. Cuba mercu tanda berdekatan atau nama stesen.",
  "status.searchdown": "Carian tidak tersedia buat masa ini. Gunakan pilihan pantas atau tekan pada peta.",
  "base.fallback": "Perkhidmatan peta terperinci tidak dapat dihubungi, jadi peta yang lebih ringkas dipaparkan. Ciri-ciri lain berfungsi seperti biasa.",
  "err.title": "Berlaku ralat",
  "err.start": "Gagal dimulakan: {msg}",
  "net.err": "Jadual tren tidak dapat dimuatkan. Sila cuba lagi kemudian.",
  "data.built": "Data jadual dijana pada {date}.",
  "data.expired": "Sebahagian jadual ini telah tamat tempoh, jadi sesetengah masa mungkin tidak tepat lagi.",
  "data.bus": "Laluan bas kerap berubah: Rapid KL telah menukar laluan yang kurang digunakan kepada perkhidmatan atas permintaan (19 laluan pada Januari 2026 dan 10 lagi pada Februari), dan perkhidmatan atas permintaan tidak diambil kira.",
  "data.bus.valid": "Jadual bas perantara sah sehingga {f}, dan bas bandar sehingga {c}.",
  "trip.to": "dari sini ke {label}",
  "trip.from": "dari {label} ke sini",
  "trip.slower": "{n} min untuk perjalanan yang lebih lama",
  "trip.average": "Purata {n} min setiap perjalanan",
  "trip.noroute": "Tiada laluan",
  "trip.noroute.body": "Tidak dapat dicapai dengan tren dari sini.",
  "trip.noroute.one": "Tiada laluan ke salah satu destinasi dari sini.",
  "trip.here": "lokasi ini",
  "popup.note": "{hours}. Masa berjalan kaki dan perjalanan ke stesen dianggarkan berdasarkan jarak garis lurus; masa menunggu ialah separuh daripada purata selang masa antara tren.",
  "popup.use.slot": "Jadikan lokasi ini destinasi {slot}",
  "popup.use.my": "Jadikan lokasi ini destinasi saya",
  "bus.board.one": "Berjalan kaki, kemudian naik bas {r}",
  "bus.board.many": "Berjalan kaki, kemudian naik bas {r}",
  "bus.alight.one": "Naik bas {r}, kemudian berjalan kaki",
  "bus.alight.many": "Naik bas {r}, kemudian berjalan kaki",
  "bus.sep": ", kemudian ",

  "bd.to": "{verb} ke {name}",
  "bd.wait": "Tunggu {line}",
  "bd.ride": "Naik {line}: {from} → {to} ({stops})",
  "bd.stops.one": "1 stesen",
  "bd.stops.many": "{n} stesen",
  "bd.bus.one": "Naik bas {r}: {from} → {to}",
  "bd.bus.many": "Naik bas {r}: {from} → {to}",
  "bd.walk.between": "Berjalan kaki antara stesen: {from} → {to}",
  "bd.change": "Tukar tren di {station}",
  "bd.total": "Jumlah",

  "net.lede": "Setiap tren dalam jadual hari bekerja, bergerak di sepanjang laluannya. Tekan tren untuk mengikutinya, atau tekan stesen untuk melihat tren yang akan bertolak.",
  "net.note": "Simulasi berdasarkan jadual yang diterbitkan, bukan kedudukan masa nyata. Tren Prasarana dijarakkan mengikut purata selang masa dalam jadual, jadi tren sebenar mungkin berbeza beberapa minit.",
  "net.weekend": "Sekarang hujung minggu di Malaysia, tetapi paparan ini menggunakan jadual hari bekerja.",
  "net.slider.aria": "Waktu dalam sehari",
  "net.speed.aria": "Kelajuan main semula",
  "net.jumps.aria": "Pergi ke waktu tertentu",
  "net.jump.am": "Puncak pagi",
  "net.jump.mid": "Tengah hari",
  "net.jump.pm": "Puncak petang",
  "net.jump.late": "Lewat malam",
  "net.jump.now": "Sekarang",
  "net.pause": "Jeda",
  "net.play": "Main",
  "net.pause.aria": "Jeda pergerakan tren",
  "net.play.aria": "Mainkan pergerakan tren",
  "net.count": "{n} tren sedang bergerak",
  "net.count.none": "Belum ada tren yang bergerak",
  "net.peek": "Tekan tren untuk mengikutinya, atau tekan stesen untuk melihat waktu bertolak.",
  "net.card.none": "Belum ada yang dipilih. Tekan tren atau stesen pada peta.",
  "net.finished": "Tren itu telah tamat perjalanannya.",
  "net.stopped": "Berhenti di <strong>{name}</strong>",
  "net.next": "Stesen seterusnya: <strong>{name}</strong> dalam {when}",
  "net.peek.stopped": "{line} ke {dest}: berhenti di {name}",
  "net.peek.next": "{line} ke {dest}: stesen seterusnya {name} dalam {when}",
  "net.follow": "Ikuti tren ini",
  "net.unfollow": "Berhenti mengikuti",
  "net.close": "Tutup",
  "net.to": "ke {name}",
  "net.deps": "Tren seterusnya",
  "net.deps.none": "Tiada tren yang bertolak dalam 40 minit akan datang pada waktu ini.",
  "net.peek.nodeps": "{name}: tiada tren dalam 40 minit akan datang",
  "net.usedest": "Jadikan destinasi saya",
  "net.lines": "Laluan",
  "net.lines.tip": "Tekan laluan untuk memaparkan laluan itu sahaja; tekan sekali lagi untuk memaparkan semua.",
  "net.now": "sekarang",
  "net.min1": "1 min",
};

const TEXT: Record<Lang, Record<Key, string>> = { en: EN, ms: MS };

const hasWindow = typeof window !== "undefined" && typeof document !== "undefined";

/** The language to use: the link's lang=, then the saved choice, then the browser's language. */
export function detectLang(): Lang {
  if (!hasWindow) return "en";
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("lang");
  if (fromHash === "ms" || fromHash === "en") return fromHash;
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "ms" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return (navigator.language || "").toLowerCase().startsWith("ms") ? "ms" : "en";
}

export let lang: Lang = detectLang();

/** For tests: use a language without a page. */
export function useLang(next: Lang) {
  lang = next;
}

/** The text for a key in the current language, with {name} placeholders filled from `vars`. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return TEXT[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** The locale for dates and numbers. */
export const locale = () => (lang === "ms" ? "ms-MY" : "en-GB");

/** Switch language: remember it, put it in the link, and reload (the link carries all the state). */
export function setLang(next: Lang) {
  try {
    localStorage.setItem("lang", next);
  } catch {
    /* private mode: the link still carries it */
  }
  const p = new URLSearchParams(location.hash.slice(1));
  if (next === "ms") p.set("lang", "ms");
  else p.delete("lang");
  history.replaceState(null, "", `#${p.toString().replaceAll("%2C", ",")}`);
  location.reload();
}

/** Fill the static markup: data-i18n (text), data-i18n-html, data-i18n-ph (placeholder), data-i18n-label (aria-label). */
export function applyStatic() {
  if (!hasWindow) return;
  document.documentElement.lang = lang;
  document.title = t("page.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("page.description"));
  const each = (attr: string, apply: (el: HTMLElement, text: string) => void) => {
    document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => apply(el, t(el.getAttribute(attr) as Key)));
  };
  each("data-i18n", (el, text) => (el.textContent = text));
  each("data-i18n-html", (el, text) => (el.innerHTML = text));
  each("data-i18n-ph", (el, text) => el.setAttribute("placeholder", text));
  each("data-i18n-label", (el, text) => el.setAttribute("aria-label", text));
}

const LINE_MS: Record<string, string> = {
  "KL Monorail Line": "Laluan Monorel KL",
  "Port Klang Line": "Laluan Pelabuhan Klang",
};
const MODE_MS: Record<string, string> = { Monorail: "Monorel", "Airport rail": "Tren lapangan terbang" };

/** A line's name as shown: "Ampang Line" becomes "Laluan Ampang" in Bahasa Melayu (Rapid KL's own wording). */
export function lineLabel(name: string): string {
  if (lang !== "ms") return name;
  if (LINE_MS[name]) return LINE_MS[name];
  return name.endsWith(" Line") ? `Laluan ${name.slice(0, -5)}` : name;
}

/** A line's mode (LRT, MRT, Monorail, ...) as shown. */
export function modeLabel(mode: string): string {
  return lang === "ms" ? (MODE_MS[mode] ?? mode) : mode;
}
