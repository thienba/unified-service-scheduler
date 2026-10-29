import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/{domain,application,infrastructure,api}/**/*.test.ts",
            "tests/{env,lint,scripts,contract}/**/*.test.ts",
          ],
          // The lint tests run ESLint over fixture text, which takes a moment on a cold start.
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/ui/**/*.test.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/application/**", "src/api/mock/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/application/ports/fakes.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        "src/domain/**": { lines: 90, branches: 90 },
        "src/application/**": { lines: 90, branches: 90 },
        "src/api/mock/**": { lines: 90 },
      },
    },
  },
});
