// Browser checks against a running site (the preview server, or the live site).
//
//   npm run build && npm run preview &      # then, in another shell:
//   npm run e2e                             # or: node e2e/e2e.mjs <url> [screenshot-dir]
//
// Uses the system Chrome/Edge (set BROWSER_PATH to point at one), with software WebGL so it also
// works on machines and CI runners without a GPU. Exits non-zero if any check fails.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const base = (process.argv[2] || "http://localhost:4173/").replace(/\/?$/, "/");
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const shot = (name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : undefined);
const browser = await chromium.launch({
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: "chrome" }),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
await page.goto(base + "?debug", { waitUntil: "load" });
await page.waitForTimeout(5000);
let failed = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, extra);
};
const text = id => page.evaluate(i => document.getElementById(i).innerText, id);

await page.click("#modes button[data-mode='network']");
await page.waitForTimeout(3500);
ok("network mode shows trains", /\d+ trains running/.test(await text("summary")), await text("summary"));
ok("hex layer hidden", await page.evaluate(() => window.__map.getLayoutProperty("hex-fill", "visibility")) === "none");

// Pause so positions stay put, then find a moving train on screen away from the panel.
await page.click("#net-play");
await page.waitForTimeout(300);
const pos = await page.evaluate(() => {
  const m = window.__map;
  const feats = m.querySourceFeatures("net-trains").filter(f => f.properties.stopped === 0);
  const pts = feats.map(f => ({ p: m.project(f.geometry.coordinates), line: f.properties.line, trip: f.properties.trip }))
    .filter(o => o.p.x > 420 && o.p.x < 1100 && o.p.y > 80 && o.p.y < 700);
  // pick one whose neighbours are not within 30px, so the click is unambiguous
  const lone = pts.find(a => pts.every(b => b === a || Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) > 30));
  return lone ? { x: lone.p.x, y: lone.p.y, trip: lone.trip } : null;
});
ok("found a train to click", !!pos, JSON.stringify(pos));
await page.mouse.click(pos.x, pos.y);
await page.waitForTimeout(600);
const card1 = await text("net-card");
ok("train card shows line, destination and next stop", /to .+/.test(card1) && /Next:|Stopped at/.test(card1), card1.replace(/\n/g, " | "));
ok("follow ring set to that trip", JSON.stringify(await page.evaluate(() => window.__map.getFilter("net-follow-ring"))).includes(String(pos.trip)));
await shot("e2e-train");

// Follow: resume and check the camera moves with the train.
const c0 = await page.evaluate(() => window.__map.getCenter().toArray());
await page.click("#net-play");
await page.click("#net-speed button[data-speed='300']");
await page.waitForTimeout(2500);
const c1 = await page.evaluate(() => window.__map.getCenter().toArray());
ok("following moves the camera", Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 0.002, `${c0.map(n => n.toFixed(4))} -> ${c1.map(n => n.toFixed(4))}`);
await page.click("#follow-close", { timeout: 1500 }).catch(() => {});

// Station departures: pause, then pick a station on screen with no train within 25px of it.
await page.click("#net-play");
await page.evaluate(() => { const m = window.__map; m.jumpTo({ center: [101.6869, 3.139], zoom: 12.3 }); });
await page.waitForTimeout(1500);
const findFreeStation = () => page.evaluate(() => {
  const m = window.__map;
  const trains = m.querySourceFeatures("net-trains").map(f => m.project(f.geometry.coordinates));
  const seen = new Set();
  for (const f of m.querySourceFeatures("stations")) {
    if (seen.has(f.properties.i)) continue; seen.add(f.properties.i);
    const p = m.project(f.geometry.coordinates);
    if (p.x < 450 || p.x > 1100 || p.y < 100 || p.y > 700) continue;
    if (trains.some(t => Math.hypot(t.x - p.x, t.y - p.y) < 25)) continue;
    return { x: p.x, y: p.y, name: f.properties.name };
  }
  return null;
});
const sp = await findFreeStation();
ok("found a station with no train on it", !!sp, JSON.stringify(sp));
await page.mouse.click(sp.x, sp.y);
await page.waitForTimeout(800);
const card2 = await text("net-card");
ok("station card lists departures", card2.includes(sp.name) && /Next departures/.test(card2), card2.split(String.fromCharCode(10)).join(" | ").slice(0, 120));
await shot("e2e-station");
await page.click("#net-play");

// Line focus.
await page.click(".line-row[data-line='1']");
await page.waitForTimeout(400);
const filter = JSON.stringify(await page.evaluate(() => window.__map.getFilter("net-trains")));
ok("focusing a line filters the trains", filter.includes("line") && filter.includes("1"), filter);
await page.click(".line-row[data-line='1']");
ok("tapping again clears the focus", (await page.evaluate(() => window.__map.getFilter("net-trains"))) == null);

// Jump to a quiet time.
await page.click("#net-jumps button[data-time='81000']");
await page.waitForTimeout(500);
ok("late-night jump changes the clock", (await text("net-time")).startsWith("22:"), await text("net-time"));

// Station -> destination -> commute map.
await page.click("#net-play");
await page.waitForTimeout(300);
const sp2 = await findFreeStation();
await page.mouse.click(sp2.x, sp2.y);
await page.waitForTimeout(600);
await page.click("#station-dest", { timeout: 4000 }).catch(async (e) => {
  console.log("FAIL station-dest missing. station:", JSON.stringify(sp2));
  console.log("card:", (await text("net-card")).split(String.fromCharCode(10)).join(" | "));
  console.log("time:", await text("net-time"), "| popups:", await page.locator(".maplibregl-popup").count());
  await shot("e2e-fail");
  throw e;
});
await page.waitForTimeout(2500);
ok("use-as-destination switches to the commute map", (await text("summary")).startsWith("Train time to " + sp2.name), await text("summary"));
ok("hexes visible again", await page.evaluate(() => window.__map.getLayoutProperty("hex-fill", "visibility")) === "visible");
ok("network layers hidden again", await page.evaluate(() => window.__map.getLayoutProperty("net-trains", "visibility")) === "none");

// Basemap switching: satellite replaces the vector layers (our overlays stay), and the choice persists.
await page.click("#basemap button[data-basemap='satellite']");
await page.waitForTimeout(800);
const sat = await page.evaluate(() => { const m = window.__map; return { sat: m.getLayoutProperty("satellite", "visibility"), water: m.getLayoutProperty("water", "visibility"), hex: m.getLayoutProperty("hex-fill", "visibility"), stations: !!m.getLayer("station-dots"), attr: document.body.dataset.basemap }; });
ok("satellite shows imagery and hides vector fills", sat.sat === "visible" && sat.water === "none" && sat.attr === "satellite", JSON.stringify(sat));
ok("our overlay layers survive the switch", sat.stations && sat.hex === "visible");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(5000);
ok("satellite choice is remembered after reload", (await page.evaluate(() => document.body.dataset.basemap)) === "satellite");
await page.click("#basemap button[data-basemap='map']");
await page.waitForTimeout(600);
const back = await page.evaluate(() => { const m = window.__map; return { sat: m.getLayoutProperty("satellite", "visibility"), water: m.getLayoutProperty("water", "visibility") }; });
ok("switching back restores the vector map", back.sat === "none" && back.water === "visible", JSON.stringify(back));

// ---- v3 additions -------------------------------------------------------------------------------
// Sharing: the address always describes the current destination.
await page.evaluate(() => window.__map.getCanvas()); // map still alive
const hash1 = await page.evaluate(() => location.hash);
ok("address carries the destination", /to=3\.\d+,101\.\d+/.test(hash1) && /name=/.test(hash1), hash1);

// Access mode: bike or e-hail reaches more of the map, and shows in the address.
const reach = () => page.evaluate(() => window.__map.querySourceFeatures("hexes").length);
const hexesWalk = await reach();
await page.click("#access button[data-access='ride']");
await page.waitForTimeout(2500);
const hexesRide = await reach();
ok("bike/e-hail covers more hexes than walking", hexesRide > hexesWalk * 1.3, `${hexesWalk} -> ${hexesRide}`);
ok("address records the access mode", (await page.evaluate(() => location.hash)).includes("via=ride"));
await page.click("#access button[data-access='walk']");
await page.waitForTimeout(1500);
ok("switching back to walking restores the smaller area", (await reach()) <= hexesRide * 0.7);

// A shared link opens on its destination, with its access mode.
const shared = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await shared.goto(base + "?debug#to=3.15785,101.71165&name=KLCC&via=ride", { waitUntil: "load" });
await shared.waitForTimeout(5000);
const sharedState = await shared.evaluate(() => ({
  summary: document.getElementById("summary").innerText,
  ride: document.querySelector("#access button[data-access='ride']").classList.contains("on"),
  center: window.__map.getCenter().toArray(),
}));
ok("shared link opens on its destination", sharedState.summary.includes("KLCC") && sharedState.ride && Math.abs(sharedState.center[0] - 101.71165) < 0.05, JSON.stringify(sharedState));
await shared.close();

// "Data as of" line and the simulated-timetable note.
ok("data date is shown", /Timetable data built \d/.test(await text("data-info")), await text("data-info"));
await page.click("#modes button[data-mode='network']");
await page.waitForTimeout(1500);
ok("network view says it is simulated", /Simulated from the published timetable/.test(await text("net-note")));

// Search finds a station by name without the network.
await page.click("#modes button[data-mode='commute']");
await page.waitForTimeout(1000);
await page.fill("#search-input", "Bukit Bintang");
await page.click("#search button[type='submit']");
await page.waitForTimeout(2500);
ok("search jumps to a station by name", (await text("summary")).includes("Bukit Bintang"), await text("summary"));

// Time of day and direction.
await page.click("#when button[data-when='pm']");
await page.waitForTimeout(1500);
await page.click("#dir button[data-dir='from']");
await page.waitForTimeout(1500);
const evening = await text("summary");
ok("evening, coming back, updates the summary", /Train time from .+, weekday evening/.test(evening), evening);
const hash2 = await page.evaluate(() => location.hash);
ok("address records time and direction", hash2.includes("when=pm") && hash2.includes("dir=from"), hash2);
await page.click("#when button[data-when='sat']");
await page.waitForTimeout(1500);
ok("Saturday works", (await text("summary")).includes("Saturday"), await text("summary"));
await page.click("#when button[data-when='am']");
await page.click("#dir button[data-dir='to']");
await page.waitForTimeout(1200);
ok("back to the morning", /Train time to .+, weekday morning/.test(await text("summary")));

console.log(errors.length ? "ERRORS: " + errors.join(" | ") : "no page errors");
await browser.close();
if (failed || errors.length) {
  console.log(`${failed} check(s) failed, ${errors.length} page error(s)`);
  process.exit(1);
}
console.log("all checks passed");
