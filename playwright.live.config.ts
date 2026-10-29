import { defineConfig, devices } from "@playwright/test";

// The live-site run: no web server, LIVE_URL is the base URL. Video for every run (D-0000-13).
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "live.spec.ts",
  use: { baseURL: process.env["LIVE_URL"], video: "on" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
