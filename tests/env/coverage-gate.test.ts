import { expect, it } from "vitest";
import config from "../../vitest.config";

it("the coverage run fails when src/domain, src/application or src/api/mock or src/infrastructure/telemetry is below 90% (AD-7, NFR-3)", () => {
  const coverage = config.test?.coverage;
  expect(coverage?.include).toEqual([
    "src/domain/**",
    "src/application/**",
    "src/api/mock/**",
    "src/infrastructure/telemetry/**",
  ]);
  expect(coverage?.thresholds).toEqual({
    "src/domain/**": { lines: 90, branches: 90 },
    "src/application/**": { lines: 90, branches: 90 },
    "src/api/mock/**": { lines: 90 },
    "src/infrastructure/telemetry/**": { lines: 90, branches: 90 },
  });
});
