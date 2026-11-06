// Copy the generated data files from /data into public/data so Vite serves them.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "data");
const dest = join(here, "..", "public", "data");
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (/^(stations|matrix.*|graph.*|feeder.*|network|meta)\.json$/.test(f)) copyFileSync(join(src, f), join(dest, f));
}
