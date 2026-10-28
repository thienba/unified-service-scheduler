import { describe, expect, it } from "vitest";
import { createApiClient, newTraceparent, startConfirmPress } from ".";

/** A client whose requests are caught instead of sent. */
function catching(headers?: () => Record<string, string>) {
  const seen: Request[] = [];
  const client = createApiClient({
    baseUrl: "https://one.test/api",
    headers,
    fetch: async (input) => {
      seen.push(input as Request);
      return new Response("[]", {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return { client, seen };
}

describe("the typed client (AD-5, AD-12)", () => {
  it("adds a new traceparent to every call", async () => {
    const { client, seen } = catching();
    await client.GET("/dealerships");
    await client.GET("/service-types");
    const [first, second] = seen.map((r) => r.headers.get("traceparent"));
    for (const value of [first, second]) {
      expect(value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    }
    expect(first).not.toBe(second);
    expect(newTraceparent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("calls the base URL it was given, and sends only the headers it is given", async () => {
    const withUser = catching(() => ({ "X-Test-User": "user-1" }));
    await withUser.client.GET("/dealerships");
    expect(withUser.seen[0]!.url).toBe("https://one.test/api/dealerships");
    expect(withUser.seen[0]!.headers.get("X-Test-User")).toBe("user-1");
    const none = catching();
    await none.client.GET("/dealerships");
    expect([...none.seen[0]!.headers.keys()].sort()).toEqual(["traceparent"]);
  });

  it("makes one key per Confirm press and reuses it on a retry of that press", async () => {
    const press = startConfirmPress();
    expect(press.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(startConfirmPress().key).not.toBe(press.key);
    const { client, seen } = catching();
    const send = () =>
      client.POST("/appointments", {
        params: { header: { "Idempotency-Key": press.key } },
        body: {},
      });
    await send();
    await send();
    expect(seen.map((r) => r.headers.get("Idempotency-Key"))).toEqual([
      press.key,
      press.key,
    ]);
  });
});
