import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "tests/e2e", use: { baseURL: "http://localhost:5181" }, projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
