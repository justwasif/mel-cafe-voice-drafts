import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    // Load .env.local so env.ts can validate process.env at import time.
    // vitest does NOT auto-load .env.local — only .env (and .env.test mode files).
    // We use a small inline setup via envDir + env, but since we need .env.local
    // specifically and env.ts reads process.env directly, we use dotenv in a
    // setup file approach:
    setupFiles: ["./__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  envDir: ".",
});
