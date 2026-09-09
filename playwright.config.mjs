import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests\\browser",
  testMatch: "*.spec.mjs",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8793", headless: true, browserName: "chromium", channel: process.env.CAPACITY_BROWSER_CHANNEL },
  webServer: { command: "node scripts\\serve-test.mjs", url: "http://127.0.0.1:8793", reuseExistingServer: false },
  reporter: "list"
});
