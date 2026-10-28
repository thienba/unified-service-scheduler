import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel worktrees each test their own build: with the fixed default, a local run reuses
// whatever preview server already holds the port, even another branch's.
const port = Number(process.env["E2E_PORT"] ?? 4173);

export default defineConfig({
  testDir: "tests/e2e",
  // Video for every run (D-0000-13).
  use: { baseURL: `http://localhost:${port}`, video: "on" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // The tests run against the built app, so the Content Security Policy is in force.
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
