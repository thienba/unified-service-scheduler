import { expect, it } from "vitest";
import config from "../../vitest.config";

it("the coverage run fails when src/domain is below 90% of lines or branches (AD-7)", () => {
  const coverage = config.test?.coverage;
  expect(coverage?.include).toEqual(["src/domain/**"]);
  expect(coverage?.thresholds).toEqual({
    "src/domain/**": { lines: 90, branches: 90 },
  });
});
