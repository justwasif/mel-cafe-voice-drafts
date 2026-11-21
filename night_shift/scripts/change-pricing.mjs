import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const DATA_DIR = path.join(process.cwd(), "data", "sample-pricing");
const STATE_FILE = path.join(process.cwd(), "data", "sample-pricing-state.json");

async function main() {
  let state: Record<string, number>;
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    state = JSON.parse(raw);
  } catch {
    console.error("[change-pricing] No state file found. Run seed-pricing first.");
    process.exit(1);
  }

  console.log("[change-pricing] Advancing to next version of each pricing page...");

  // Quillpad Pro $12 → $15
  if (state.quillpad < 2) { state.quillpad = 2; console.log("  → Quillpad: Pro $12→$15"); }

  // Notably drops free plan
  if (state.notably < 2) { state.notably = 2; console.log("  → Notably: Free plan removed"); }

  // Inkwell team seats 5 → 3
  if (state.inkwell < 2) { state.inkwell = 2; console.log("  → Inkwell: Writer seats 5→3"); }

  // Paperline adds Enterprise
  if (state.paperline < 2) { state.paperline = 2; console.log("  → Paperline: Enterprise plan added"); }

  // Briefcase unchanged (only has v1)
  console.log("  → Briefcase Notes: unchanged");

  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  console.log("\n[change-pricing] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
