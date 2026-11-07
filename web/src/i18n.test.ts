import { describe, expect, it } from "vitest";
import { breakdownHtml } from "./breakdown";
import { lineLabel, modeLabel, t, useLang, type Key } from "./i18n";

// Both languages are compared by reading the module's own table through t().
const keys = (() => {
  // t() throws on an unknown key, so collect the keys from the source of truth: the English table.
  // The table is not exported on purpose, so read the file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require("node:fs").readFileSync(new URL("./i18n.ts", import.meta.url), "utf-8") as string;
  const start = src.indexOf("const EN = {");
  const end = src.indexOf("} as const;", start);
  return [...src.slice(start, end).matchAll(/^\s+"([\w.]+)":/gm)].map((m) => m[1] as Key);
})();

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("translations", () => {
  it("has a good number of keys", () => {
    expect(keys.length).toBeGreaterThan(150);
  });

  it("gives every key text in both languages with the same placeholders", () => {
    for (const key of keys) {
      useLang("en");
      const en = t(key);
      useLang("ms");
      const ms = t(key);
      expect(en.length, key).toBeGreaterThan(0);
      expect(ms.length, key).toBeGreaterThan(0);
      expect(placeholders(ms), key).toBe(placeholders(en));
    }
    useLang("en");
  });

  it("translates nearly everything (only a few strings are the same in both)", () => {
    const same = keys.filter((key) => {
      useLang("en");
      const en = t(key);
      useLang("ms");
      return t(key) === en;
    });
    useLang("en");
    // Numbers, units and names that are written the same: "{n} min", "1 min", the line codes.
    expect(same.length).toBeLessThan(10);
  });

  it("uses everyday Malaysian transit words, not the ones a first draft got wrong", () => {
    useLang("ms");
    const all = keys.map((k) => t(k)).join(" | ");
    useLang("en");
    // "tren" for urban rail (Rapid KL's own word), trains "bertolak" (berlepas is for flights),
    // feeder buses are "bas perantara", and errors are "ralat".
    for (const wrong of ["kereta api", "berlepas", "penyuap", "Sesuatu telah berlaku", "Balik", "Ketik", "ketik", "Jeda", "pantas",
      "ulang-alik", "ulang‑alik", "Alih keluar", "mewarnakan", "sepintas", "selang masa", "hari bekerja"]) {
      expect(all, wrong).not.toContain(wrong);
    }
    expect(all).toContain("tren");
    expect(all).toContain("bas perantara");
    expect(all).toContain("kekerapan tren");
    expect(all).toContain("Isnin–Jumaat");
  });

  it("fills placeholders", () => {
    useLang("ms");
    expect(t("pin.near", { station: "KL Sentral" })).toBe("pin anda berhampiran KL Sentral");
    useLang("en");
    expect(t("pin.near", { station: "KL Sentral" })).toBe("your pin near KL Sentral");
  });

  it("leaves an unknown placeholder visible rather than dropping it", () => {
    expect(t("cand.max", {})).toContain("{n}");
  });

  it("the trip breakdown speaks Bahasa Melayu", () => {
    useLang("ms");
    const html = breakdownHtml({
      walkToStation: { name: "Surian", minutes: 6 },
      route: {
        total: 20,
        segments: [
          { kind: "wait", line: "KGL", station: 0, minutes: 2 },
          { kind: "ride", line: "KGL", from: 0, to: 1, stops: 3, minutes: 12 },
          { kind: "bus", routes: "590 > T453", from: 1, to: 2, minutes: 10 },
        ],
      },
      stationName: (i) => ["Surian", "Muzium Negara", "Bukit Dukung"][i],
      walkToDestination: { name: "pejabat", minutes: 4 },
      total: 40,
    });
    useLang("en");
    expect(html).toContain("Berjalan kaki ke Surian");
    expect(html).toContain("Tunggu KGL");
    expect(html).toContain("Naik KGL: Surian → Muzium Negara (3 stesen)");
    expect(html).toContain("Naik bas 590, kemudian bas T453: Muzium Negara → Bukit Dukung");
    expect(html).toContain("Jumlah");
  });

  it("names KTM lines in Bahasa Melayu inside the trip breakdown", () => {
    useLang("ms");
    const html = breakdownHtml({
      walkToStation: { name: "Kajang", minutes: 5, via: t("bus.board.many", { r: `T450${t("bus.sep")}T451` }) },
      route: { total: 30, segments: [{ kind: "ride", line: "Seremban Line", from: 0, to: 1, stops: 1, minutes: 30 }] },
      stationName: (i) => ["Kajang", "KL Sentral"][i],
      walkToDestination: { name: "pejabat", minutes: 3, via: t("bus.alight.one", { r: "T789" }) },
      total: 40,
    });
    useLang("en");
    expect(html).toContain("Berjalan kaki dan naik bas T450, kemudian bas T451 ke Kajang");
    expect(html).toContain("Naik Laluan Seremban: Kajang → KL Sentral (1 stesen)");
    expect(html).toContain("Naik bas T789, lalu berjalan kaki ke pejabat");
  });

  it("joins the pieces of a sentence into grammatical Bahasa Melayu", () => {
    useLang("ms");
    const names = `KLCC ${t("names.and")} Mid Valley`;
    const dir = t("dir.to.word");
    expect(t("sum.worst", { dir, names, when: t("when.label.am") })).toBe(
      "Masa perjalanan ke KLCC dan Mid Valley (yang lebih lama), pagi Isnin–Jumaat",
    );
    expect(t("legend.worst", { dir, names })).toBe("Masa perjalanan ke KLCC dan Mid Valley (yang lebih lama antara kedua-duanya):");
    expect(t("status.stranded", { reach: t("reach.bus"), which: `A ${t("or")} B` })).toContain(
      "Tiada stesen yang dapat dicapai dari destinasi A atau B dengan berjalan kaki sejauh 1.5 km atau menaiki bas, jadi",
    );
    expect(t("rank.note.two", { measure: t("rank.measure.worst") })).toContain("kedua-dua destinasi (yang lebih lama), tidak termasuk");
    expect(t("net.next", { name: "Pasar Seni", when: t("net.in", { when: t("min", { n: 3 }) }) })).toBe(
      "Stesen seterusnya: <strong>Pasar Seni</strong>, 3 min lagi",
    );
    useLang("en");
    expect(t("net.next", { name: "Pasar Seni", when: t("net.in", { when: t("min", { n: 3 }) }) })).toBe(
      "Next: <strong>Pasar Seni</strong>, in 3 min",
    );
  });

  it("translates line names the way Rapid KL writes them, and leaves English alone", () => {
    useLang("ms");
    expect(lineLabel("Ampang Line")).toBe("Laluan Ampang");
    expect(lineLabel("KL Monorail Line")).toBe("Laluan Monorel KL");
    expect(lineLabel("Port Klang Line")).toBe("Laluan Pelabuhan Klang");
    expect(lineLabel("KLIA Ekspres")).toBe("KLIA Ekspres");
    expect(modeLabel("Monorail")).toBe("Monorel");
    expect(modeLabel("Airport rail")).toBe("Tren lapangan terbang");
    expect(modeLabel("LRT")).toBe("LRT");
    useLang("en");
    expect(lineLabel("Ampang Line")).toBe("Ampang Line");
    expect(modeLabel("Monorail")).toBe("Monorail");
  });
});
