import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "**/*.pw.ts", fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:1420", channel: "chrome", headless: true, viewport: { width: 940, height: 720 } },
  webServer: { command: "corepack pnpm dev", url: "http://127.0.0.1:1420", reuseExistingServer: !process.env.CI },
  outputDir: "/tmp/pastelens-ui-tests",
});
