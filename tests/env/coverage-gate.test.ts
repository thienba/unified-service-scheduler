import { expect, it } from "vitest";
import config from "../../vitest.config";

it("the coverage run fails when src/domain or src/application is below 90% of lines or branches (AD-7, NFR-3)", () => {
  const coverage = config.test?.coverage;
  expect(coverage?.include).toEqual(["src/domain/**", "src/application/**"]);
  expect(coverage?.thresholds).toEqual({
    "src/domain/**": { lines: 90, branches: 90 },
    "src/application/**": { lines: 90, branches: 90 },
  });
});
