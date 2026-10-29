import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it("the app's Zod settings turn off generated code, so making and using a schema never calls Function (SEC-15)", async () => {
  const spy = vi.spyOn(globalThis, "Function");
  await import("./zod-config");
  const { z } = await import("zod");
  expect(z.config().jitless).toBe(true);
  const schema = z.object({ name: z.string(), seats: z.number() });
  expect(schema.parse({ name: "Coupe", seats: 4 })).toEqual({
    name: "Coupe",
    seats: 4,
  });
  expect(schema.safeParse({ name: 1 }).success).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});
