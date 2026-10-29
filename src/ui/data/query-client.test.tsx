import { useMutation } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createApiClient, startConfirmPress } from "../../api/client";
import { call } from "./api-problem";
import { createQueryClient } from "./query-client";

afterEach(cleanup);

it("a failed POST is sent once; Try again sends it again with the same Idempotency-Key (D-0000-20, AD-5)", async () => {
  const seen: Request[] = [];
  let failing = true;
  const client = createApiClient({
    baseUrl: "https://one.test/api",
    fetch: async (input) => {
      seen.push(input as Request);
      return failing
        ? new Response(
            JSON.stringify({
              type: "x",
              title: "x",
              status: 500,
              code: "INTERNAL",
              traceId: "a".repeat(32),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          )
        : new Response("{}", {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
    },
  });
  const press = startConfirmPress();
  function Book() {
    const book = useMutation({
      mutationFn: () =>
        call(
          client.POST("/appointments", {
            params: { header: { "Idempotency-Key": press.key } },
            body: {
              dealershipId: "d",
              serviceTypeId: "s",
              start: "2026-10-30T10:00:00Z",
              transport: "wait",
              vehicleId: "v",
            },
          }),
        ),
    });
    return (
      <button onClick={() => book.mutate()}>
        {book.isError ? "Try again" : "Confirm"}
      </button>
    );
  }
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Book />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByRole("button", { name: "Try again" });
  await new Promise((r) => setTimeout(r, 50));
  expect(seen).toHaveLength(1);
  failing = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(seen).toHaveLength(2));
  expect(seen[1]!.headers.get("Idempotency-Key")).toBe(
    seen[0]!.headers.get("Idempotency-Key"),
  );
});
