import { expect, it } from "vitest";

it("the Node projects have no document, so a domain test that touches it fails", () => {
  expect(typeof document).toBe("undefined");
  expect(() => document.title).toThrow(ReferenceError);
});
