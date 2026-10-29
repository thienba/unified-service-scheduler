import { expect, it } from "vitest";
import { ApiProblem, type Problem } from "./api-problem";
import { describeProblem } from "./words";

const trace = "4bf92f35a1b2c3d4e5f60718293a4b5c";
const make = (
  status: number,
  code: Problem["code"],
  extra: Partial<Problem> = {},
) =>
  new ApiProblem(
    status,
    { type: "x", title: code, status, code, traceId: trace, ...extra },
    null,
  );

it("401 says the person is not signed in", () => {
  const w = describeProblem(make(401, "UNKNOWN_USER"));
  expect(w.title).toBe("You are not signed in.");
  expect(w.kind).toBe("signed-out");
});

it("403 says what the role cannot do", () => {
  const w = describeProblem(make(403, "FORBIDDEN"), { role: "staff" });
  expect(w.title).toBe("You cannot do that as Staff.");
  expect(w.body).toContain("Switch role, or go to the schedule.");
});

it("404 says it may be removed or someone else's, and 'another dealership' for the garage", () => {
  expect(describeProblem(make(404, "NOT_FOUND")).body).toBe(
    "It may have been removed, or it belongs to someone else.",
  );
  expect(
    describeProblem(make(404, "NOT_FOUND"), { scope: "dealership" }).body,
  ).toBe("It may have been removed, or it belongs to another dealership.");
  expect(describeProblem(make(404, "NOT_FOUND")).title).toBe(
    "We cannot find that appointment.",
  );
});

it("CHANGE_WINDOW_CLOSED says it can no longer be changed online", () => {
  const w = describeProblem(make(409, "CHANGE_WINDOW_CLOSED"), {
    dealershipName: "Northgate Motors",
    cutoffHours: 2,
  });
  expect(w.title).toBe("This appointment can no longer be changed online.");
  expect(w.body).toBe(
    "It starts in less than 2 hours. Contact Northgate Motors to change it.",
  );
});

it("a 409 SLOT_UNAVAILABLE gives each reason in words and never the raw code", () => {
  const w = describeProblem(
    make(409, "SLOT_UNAVAILABLE", { reasons: ["TECHNICIAN_BUSY", "BAY_BUSY"] }),
  );
  expect(w.reasons).toEqual([
    "every technician who can do this job is busy then",
    "every service bay is in use then",
  ]);
  expect(JSON.stringify(w)).not.toMatch(
    /TECHNICIAN_BUSY|BAY_BUSY|SLOT_UNAVAILABLE/,
  );
});

it("422 gives each field's own message and a count", () => {
  const w = describeProblem(
    make(422, "VALIDATION_FAILED", {
      errors: [
        { field: "plate", message: "Registration is missing." },
        { field: "phone", message: "Phone is too short." },
      ],
    }),
  );
  expect(w.title).toBe("2 things need fixing before we can book this.");
  expect(w.fields).toHaveLength(2);
});

it("500 and no network say something went wrong, with the first 8 characters of the trace id when there is one", () => {
  const server = describeProblem(make(500, "INTERNAL"));
  expect(server.title).toBe("Something went wrong on our side.");
  expect(server.body).toBe(
    "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35.",
  );
  expect(server.reference).toBe("4bf92f35");
  const offline = describeProblem(new TypeError("Failed to fetch"));
  expect(offline.title).toBe("Something went wrong on our side.");
  expect(offline.reference).toBeNull();
  expect(offline.body).not.toContain("undefined");
});
