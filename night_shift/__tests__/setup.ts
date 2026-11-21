// Test setup: load .env.local so that lib/env.ts can validate process.env
// at import time. vitest does not auto-load .env.local — only .env files.
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });
