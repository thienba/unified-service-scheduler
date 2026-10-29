// With `VITE_API_MODE=remote` the dev panel does not exist: /dev is `not-found` and no link points to it (SEC-14).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../config")>()),
  mockEnabled: false,
}));

afterEach(cleanup);

it("in a remote build /dev is not-found, with no dev panel link and no call to /_demo/", async () => {
  const { App } = await import("../../app/App");
  const { fakeApi } = await import("../../app/fake-api");
  const api = fakeApi();
  render(
    <App
      baseUrl="https://api.test/api"
      fetch={api.fetcher}
      initialEntries={["/dev"]}
      demo={null}
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "We cannot find that page." }),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Dev panel" })).toBeNull();
  expect(screen.queryByRole("link", { name: /dev panel/i })).toBeNull();
  expect(api.calls.some((c) => c.url.includes("/_demo/"))).toBe(false);
});
