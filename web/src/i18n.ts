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
  "rank.note.two": "Minutes {measure} {dir} both destinations, from the station itself. Add a few minutes for the walk or ride to it.",
  "rank.note.one": "Minutes {dir} your destination, from the station itself. Add a few minutes for the walk or ride to it.",
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
  "page.title": "Di mana saya boleh tinggal? Peta perjalanan Lembah Klang",
  "page.description": "Lihat bahagian Lembah Klang yang berada dalam jarak 30, 45 atau 60 minit dengan kereta api dari pejabat atau kampus anda, dan saksikan kereta api bergerak.",
  "app.title": "Di mana saya boleh tinggal?",
  "app.loading": "Memuatkan…",
  "lang.switch": "English",
  "lang.switch.short": "EN",

  "basemap.aria": "Jenis peta",
  "basemap.map": "Peta",
  "basemap.satellite": "Satelit",
  "panel.aria": "Kawalan",
  "grabber.aria": "Kembangkan atau lipat panel",
  "collapse.hide": "Sembunyi",
  "collapse.options": "Pilihan",
  "modes.aria": "Paparan",
  "modes.commute": "Peta perjalanan",
  "modes.network": "Rangkaian kereta api",

  "lede": "Pilih tempat anda bekerja atau belajar. Peta mewarnakan setiap kawasan mengikut tempoh perjalanan kereta api ke sana, dari pintu ke pintu.",
  "s1.title": "Di mana anda bekerja atau belajar?",
  "slots.aria": "Destinasi yang sedang anda pilih",
  "slot.a": "Destinasi A",
  "slot.b": "Destinasi B",
  "slot.b.add": "Tambah yang kedua (B)",
  "slot.note.set": "Memilih destinasi {slot}: {label}. Cari, ketik pilihan pantas, pilih lokasi atau seret pinnya untuk menukarnya.",
  "slot.note.b": "Pilih tempat kedua yang perlu anda tuju. Peta kemudian menunjukkan perjalanan yang lebih lama antara kedua-duanya.",
  "slot.note.a": "Cari, ketik pilihan pantas atau pilih lokasi pada peta.",
  "slot.status.b": "Sekarang pilih destinasi B: cari, ketik pilihan pantas atau pilih lokasi pada peta.",
  "remove.b": "Buang destinasi B",
  "measure.aria": "Cara menggabungkan dua perjalanan",
  "measure.worst": "Perjalanan lebih lama",
  "measure.average": "Purata perjalanan",
  "measure.note.worst": "Setiap kawasan diwarnakan mengikut perjalanan yang lebih lama, jadi sesuatu warna bermaksud kedua-dua perjalanan sekurang-kurangnya sebaik itu.",
  "measure.note.average": "Setiap kawasan diwarnakan mengikut purata perjalanan, dengan setiap destinasi dikira mengikut kekerapan anda pergi. Tetapkan pemberat kepada 0 untuk mengabaikannya.",
  "weights.text": "perjalanan seminggu",
  "search.placeholder": "Cari tempat atau alamat",
  "search.aria": "Cari tempat atau alamat",
  "search.button": "Cari",
  "chips.aria": "Pilihan pantas",
  "pick.default": "Atau pilih satu lokasi pada peta",
  "pick.cancel": "Ketik peta untuk meletakkannya (batal)",
  "pin.label": "Destinasi",
  "pin.drag": "Seret untuk mengalihkan destinasi ini.",
  "pin.near": "pin anda berhampiran {station}",
  "pick.status.dest": "Ketik di mana-mana pada peta untuk meletakkan destinasi anda.",
  "pick.status.cand": "Ketik di mana-mana pada peta untuk menambah tempat yang anda pertimbangkan.",

  "s2.title": "Bagaimana anda ke stesen?",
  "access.aria": "Cara anda ke stesen",
  "access.walk": "Jalan kaki",
  "access.bus": "Bas",
  "access.ride": "Basikal/e-hail",
  "access.note.walk": "Stesen dalam jarak berjalan kaki 1.5 km, pada 4.5 km/j.",
  "access.note.bus": "Berjalan sehingga 1.5 km ke stesen, atau sehingga 500 m ke perhentian bas Rapid KL (laluan penyuap atau bandar) yang ada bas ke stesen, bertukar bas jika itu lebih cepat. Termasuk masa menunggu setiap bas.",
  "access.note.ride": "Berjalan ke stesen sehingga 1.5 km; selebihnya dengan basikal, skuter atau kereta e-hailing sehingga 4 km pada kira-kira 20 km/j, tambah 4 minit untuk bermula.",
  "reach.walk": "jarak berjalan kaki 1.5 km",
  "reach.bus": "jarak berjalan kaki 1.5 km atau satu bas",
  "reach.ride": "perjalanan 4 km",
  "verb.walk": "Berjalan",
  "verb.ride": "Berjalan atau e-hailing",

  "s3.title": "Bila, dan ke arah mana?",
  "when.aria": "Waktu anda bergerak",
  "when.am": "Pagi",
  "when.pm": "Petang",
  "when.sat": "Sab",
  "when.sun": "Ahd",
  "dir.aria": "Arah perjalanan",
  "dir.to": "Pergi ke sana",
  "dir.from": "Balik",
  "dir.to.word": "ke",
  "dir.from.word": "dari",
  "when.label.am": "pagi hari bekerja",
  "when.label.pm": "petang hari bekerja",
  "when.label.sat": "Sabtu",
  "when.label.sun": "Ahad",
  "when.hours.am": "Pagi hari bekerja (kereta api bertolak 7–9 pagi)",
  "when.hours.pm": "Petang hari bekerja (kereta api bertolak 5–7:30 petang)",
  "when.hours.sat": "Sabtu (kereta api bertolak 10 pagi–12 tengah hari)",
  "when.hours.sun": "Ahad (kereta api bertolak 10 pagi–12 tengah hari)",
  "when.note.to": "{hours}. Pilih \"balik\" untuk melihat perjalanan pulang.",
  "when.note.from": "{hours}. Menunjukkan tempoh perjalanan dari destinasi anda ke setiap kawasan, contohnya perjalanan pulang.",

  "s4.title": "Baca peta",
  "legend.default": "Masa dari setiap kawasan ke destinasi anda:",
  "legend.to": "Masa dari setiap kawasan ke {names}:",
  "legend.from": "Masa dari {names} ke setiap kawasan:",
  "legend.worst": "Yang lebih lama antara dua perjalanan, {dir} {names}:",
  "legend.average": "Purata dua perjalanan, ditimbang mengikut perjalanan seminggu, {dir} {names}:",
  "band.u30": "Kurang 30 min",
  "band.30": "30–45 min",
  "band.45": "45–60 min",
  "band.o60": "Lebih 60 min",
  "s4.tap": "<strong>Ketik kawasan berwarna</strong> untuk melihat perjalanan: berjalan, kereta api, pertukaran. Kawasan tanpa warna tiada stesen dalam jangkauan.",
  "share.button": "Salin pautan peta ini",
  "share.done": "Pautan disalin",
  "share.fail": "Salin alamat daripada bar alamat pelayar anda untuk berkongsi peta ini.",

  "s5.title": "Bandingkan tempat yang anda pertimbangkan",
  "s5.note": "Tambah beberapa alamat atau lokasi untuk melihat perjalanan setiap satu sekali pandang. Ia disimpan dalam pautan.",
  "cand.placeholder": "Tambah alamat atau tempat",
  "cand.aria": "Tambah tempat yang anda pertimbangkan",
  "cand.add": "Tambah",
  "cand.pick": "Atau ketik peta untuk menambah satu",
  "cand.pick.cancel": "Ketik peta untuk menambahnya (batal)",
  "cand.list.aria": "Tempat yang anda pertimbangkan",
  "cand.remove.aria": "Buang {name}",
  "cand.max": "Anda boleh membandingkan sehingga {n} tempat. Buang satu untuk menambah yang lain.",
  "cand.added": "{label} ditambah.",
  "cand.down": "Carian tidak tersedia sekarang. Ketik peta untuk menambah tempat.",
  "s6.title": "Stesen terbaik untuk tinggal berdekatan",
  "rank.measure.worst": "(perjalanan lebih lama)",
  "rank.measure.average": "(purata perjalanan)",
  "rank.note.two": "Minit {measure} {dir} kedua-dua destinasi, dari stesen itu sendiri. Tambah beberapa minit untuk berjalan atau menaiki kenderaan ke sana.",
  "rank.note.one": "Minit {dir} destinasi anda, dari stesen itu sendiri. Tambah beberapa minit untuk berjalan atau menaiki kenderaan ke sana.",
  "calc.summary": "Bagaimana ini dikira?",
  "calc.body": "Masa kereta api datang daripada jadual rasmi LRT, MRT, Monorel, BRT, KTM Komuter dan KLIA Ekspres/Transit. Masa menunggu ialah separuh daripada purata sela antara kereta api (paling lama 20 minit), setiap pertukaran menambah 5 minit, dan berjalan kaki dianggarkan pada 4.5 km/j melalui laluan 60% lebih panjang daripada garis lurus. Bas Rapid KL boleh membawa anda ke stesen jika anda memilih Bas. Anggaplah keputusan sebagai panduan, bukan perancang perjalanan.",

  "names.and": "dan",
  "or": "atau",
  "min": "{n} min",
  "no.route": "tiada laluan",
  "sum.single": "Masa kereta api {dir} {names}, {when}",
  "sum.worst": "Perjalanan lebih lama {dir} {names}, {when}",
  "sum.average": "Purata perjalanan {dir} {names}, {when}",
  "peek.example": "Destinasi contoh. Ketik Pilihan untuk memilih destinasi anda sendiri.",
  "peek.tip": "Ketik kawasan berwarna untuk melihat perjalanan. Ketik Pilihan untuk menukar destinasi.",
  "status.stranded": "Tiada stesen dalam {reach} dari destinasi {which}, jadi tiada apa yang boleh dicapai dengan kereta api dari situ. Cuba tempat yang lebih dekat dengan stesen.",
  "status.tap.two": "Ketik kawasan berwarna untuk melihat kedua-dua perjalanan dari situ.",
  "status.tap.one": "Ketik kawasan berwarna untuk melihat bagaimana anda akan sampai ke sana.",
  "status.nohit": "Ketik kawasan berwarna untuk melihat perjalanannya. Untuk menukar destinasi, cari, gunakan pilihan pantas, atau pilih \"pilih lokasi pada peta\".",
  "status.example": "Ini ialah contoh. Tukar destinasi pada langkah 1 untuk melihat perjalanan anda sendiri.",
  "status.searching": "Mencari…",
  "status.nomatch": "Tiada padanan untuk \"{q}\" di Lembah Klang. Cuba mercu tanda berdekatan atau nama stesen.",
  "status.searchdown": "Carian tidak tersedia sekarang. Gunakan pilihan pantas atau ketik peta.",
  "base.fallback": "Perkhidmatan peta asas terperinci tidak bertindak balas, jadi peta yang lebih ringkas dipaparkan; semua yang lain berfungsi seperti biasa.",
  "err.title": "Sesuatu telah berlaku",
  "err.start": "Gagal dimulakan: {msg}",
  "net.err": "Tidak dapat memuatkan jadual kereta api. Cuba lagi kemudian.",
  "data.built": "Data jadual dibina pada {date}.",
  "data.expired": "Sebahagian jadual ini telah tamat tempoh, jadi sesetengah masa mungkin sudah lapuk.",
  "data.bus": "Laluan bas kerap berubah: Rapid KL telah menukar laluan yang jarang digunakan kepada perkhidmatan atas permintaan (19 pada Januari 2026, 10 lagi pada Februari), dan perkhidmatan atas permintaan tidak dimodelkan.",
  "data.bus.valid": "Jadual bas penyuap sah sehingga {f}, bas bandar sehingga {c}.",
  "trip.to": "dari sini ke {label}",
  "trip.from": "dari {label} ke sini",
  "trip.slower": "{n} min untuk perjalanan yang lebih lama",
  "trip.average": "{n} min purata setiap perjalanan",
  "trip.noroute": "Tiada laluan",
  "trip.noroute.body": "Tidak boleh dicapai dengan kereta api dari sini.",
  "trip.noroute.one": "Tiada laluan ke salah satu destinasi dari sini.",
  "trip.here": "lokasi ini",
  "popup.note": "{hours}. Berjalan dan perjalanan ke stesen ialah anggaran garis lurus; masa menunggu ialah separuh daripada purata sela antara kereta api.",
  "popup.use.slot": "Gunakan lokasi ini sebagai destinasi {slot}",
  "popup.use.my": "Gunakan lokasi ini sebagai destinasi saya",
  "bus.board.one": "Berjalan, kemudian bas {r}",
  "bus.board.many": "Berjalan, kemudian bas {r}",
  "bus.alight.one": "Bas {r}, kemudian berjalan",
  "bus.alight.many": "Bas {r}, kemudian berjalan",
  "bus.sep": ", kemudian ",

  "bd.to": "{verb} ke {name}",
  "bd.wait": "Tunggu {line}",
  "bd.ride": "Naik {line}: {from} → {to} ({stops})",
  "bd.stops.one": "1 perhentian",
  "bd.stops.many": "{n} perhentian",
  "bd.bus.one": "Bas {r}: {from} → {to}",
  "bd.bus.many": "Bas {r}: {from} → {to}",
  "bd.walk.between": "Berjalan antara stesen: {from} → {to}",
  "bd.change": "Tukar di {station}",
  "bd.total": "Jumlah",

  "net.lede": "Setiap kereta api pada jadual hari bekerja, bergerak di sepanjang laluannya. Ketik kereta api untuk mengikutinya, atau stesen untuk melihat yang berlepas seterusnya.",
  "net.note": "Disimulasikan daripada jadual yang diterbitkan, bukan kedudukan sebenar. Kereta api Prasarana dijarakkan mengikut purata sela jadual, jadi kereta api sebenar boleh berbeza beberapa minit.",
  "net.weekend": "Ia hujung minggu di Malaysia, tetapi ini menunjukkan jadual hari bekerja.",
  "net.slider.aria": "Waktu dalam sehari",
  "net.speed.aria": "Kelajuan main semula",
  "net.jumps.aria": "Lompat ke waktu dalam sehari",
  "net.jump.am": "Waktu puncak pagi",
  "net.jump.mid": "Tengah hari",
  "net.jump.pm": "Waktu puncak petang",
  "net.jump.late": "Lewat malam",
  "net.jump.now": "Sekarang",
  "net.pause": "Jeda",
  "net.play": "Main",
  "net.pause.aria": "Jeda kereta api",
  "net.play.aria": "Main kereta api",
  "net.count": "{n} kereta api sedang beroperasi",
  "net.count.none": "Belum ada kereta api beroperasi",
  "net.peek": "Ketik kereta api untuk mengikutinya, atau stesen untuk waktu berlepas.",
  "net.card.none": "Tiada yang dipilih. Ketik kereta api atau stesen pada peta.",
  "net.finished": "Perjalanan itu telah tamat.",
  "net.stopped": "Berhenti di <strong>{name}</strong>",
  "net.next": "Seterusnya: <strong>{name}</strong> dalam {when}",
  "net.peek.stopped": "{line} ke {dest}: berhenti di {name}",
  "net.peek.next": "{line} ke {dest}: seterusnya {name} dalam {when}",
  "net.follow": "Ikut kereta api ini",
  "net.unfollow": "Berhenti mengikut",
  "net.close": "Tutup",
  "net.to": "ke {name}",
  "net.deps": "Waktu berlepas seterusnya",
  "net.deps.none": "Tiada waktu berlepas dalam 40 minit akan datang pada waktu ini.",
  "net.peek.nodeps": "{name}: tiada waktu berlepas dalam 40 minit akan datang",
  "net.usedest": "Gunakan sebagai destinasi saya",
  "net.lines": "Laluan",
  "net.lines.tip": "Ketik satu laluan untuk fokus padanya, ketik lagi untuk menunjukkan semua.",
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
const MODE_MS: Record<string, string> = { Monorail: "Monorel", "Airport rail": "Rel lapangan terbang" };

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
