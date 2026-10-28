// Local only (not committed): the same config on port 4183, so a server from another worktree on 4173 is never reused.
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

const port = 4183;
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
