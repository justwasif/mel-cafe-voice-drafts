import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const DATA_DIR = path.join(process.cwd(), "data", "sample-pricing");
const STATE_FILE = path.join(process.cwd(), "data", "sample-pricing-state.json");

const SLUGS = ["quillpad", "notably", "inkwell", "paperline", "briefcase-notes"];

interface PageData {
  slug: string;
  name: string;
  versions: unknown[];
}

async function main() {
  console.log("[seed-pricing] Writing v1 pricing pages for all 5 sample companies...");

  for (const slug of SLUGS) {
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as PageData;
      console.log(`  ✓ ${data.name} (${slug}) — ${data.versions.length} versions available`);
    } catch {
      console.warn(`  ⚠ ${slug} — no data file found, skipping`);
    }
  }

  // Write initial state: all at version 1
  const state: Record<string, number> = {};
  for (const slug of SLUGS) {
    state[slug] = 1;
  }
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));

  console.log(`\n[seed-pricing] Done. All ${SLUGS.length} pages set to v1.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
