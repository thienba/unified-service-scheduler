// With `VITE_API_MODE=remote` the new-customer form has no demo note (SEC-13.AC-3).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../config")>()),
  mockEnabled: false,
}));

afterEach(cleanup);

it("in a remote build the new-customer form shows no demo note", async () => {
  const { App } = await import("../../app/App");
  const { fakeApi, json } = await import("../../app/fake-api");
  const api = fakeApi({
    "GET /me": () =>
      json({
        userId: "u-staff",
        name: "Daniel Okoye",
        role: "staff",
        customerId: null,
        dealershipIds: ["d-leeds"],
      }),
  });
  render(
    <App
      baseUrl="https://api.test/api"
      fetch={api.fetcher}
      initialEntries={["/book/for-customer"]}
      demo={null}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Add a new customer" }),
  );
  expect(await screen.findByRole("group", { name: "Customer" })).toBeTruthy();
  expect(screen.queryByText("This is a demo.")).toBeNull();
});
