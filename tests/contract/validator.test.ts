// The checker itself (AD-2 Check): it must fail a response the contract does not allow, or the
// contract tests would pass whatever the mock answered.
import { describe, expect, it } from "vitest";
import {
  matchOperation,
  operations,
  validateRequest,
} from "../../src/api/contract/validator";
import { checkResponse } from "./check-response";

const operation = (id: string) => operations.find((o) => o.id === id)!;
const headers = (extra: Record<string, string> = {}) =>
  new Headers({
    "content-type": "application/json",
    "x-trace-id": "a".repeat(32),
    ...extra,
  });
const me = {
  userId: "u",
  name: "N",
  role: "customer",
  customerId: "c",
  dealershipIds: [],
};

describe("checkResponse", () => {
  it("accepts a response that matches the contract", () => {
    expect(checkResponse(operation("getMe"), 200, headers(), me)).toEqual([]);
  });

  it("fails a field the contract does not describe", () => {
    const problems = checkResponse(operation("getMe"), 200, headers(), {
      ...me,
      email: "leaked@example.test",
    });
    expect(problems).toEqual([
      expect.stringContaining("body / additionalProperties"),
    ]);
  });

  it("fails a status the operation does not declare", () => {
    expect(checkResponse(operation("getMe"), 409, headers(), me)).toEqual([
      "getMe: status 409 is not in the contract",
    ]);
  });

  it("fails a missing or malformed X-Trace-Id", () => {
    const none = new Headers({ "content-type": "application/json" });
    expect(checkResponse(operation("getMe"), 200, none, me)).toEqual([
      expect.stringContaining("header X-Trace-Id is missing"),
    ]);
    const bad = headers({ "x-trace-id": "ABC" });
    expect(checkResponse(operation("getMe"), 200, bad, me)).toEqual([
      expect.stringContaining("not in the expected format"),
    ]);
  });

  it("fails a wrong content type, and an error that is not a Problem", () => {
    const wrong = headers({ "content-type": "text/plain" });
    expect(checkResponse(operation("getMe"), 200, wrong, me)).toEqual([
      expect.stringContaining('content type "text/plain"'),
    ]);
    const problem = headers({ "content-type": "application/problem+json" });
    expect(
      checkResponse(operation("getMe"), 401, problem, { code: "NOPE" }),
    ).not.toEqual([]);
  });

  it("fails a code that is not one of the fixed codes", () => {
    const problem = headers({ "content-type": "application/problem+json" });
    const body = {
      type: "/problems/x",
      title: "t",
      status: 401,
      code: "SOMETHING_ELSE",
      traceId: "a".repeat(32),
    };
    expect(checkResponse(operation("getMe"), 401, problem, body)).toEqual([
      expect.stringContaining("body /code enum"),
    ]);
  });
});

describe("matchOperation and validateRequest", () => {
  it("finds an operation and its path values, and knows nothing about other methods or paths", () => {
    expect(matchOperation("GET", "/appointments/abc")?.pathParams).toEqual({
      appointmentId: "abc",
    });
    expect(matchOperation("DELETE", "/appointments/abc")).toBeUndefined();
    expect(matchOperation("GET", "/nothing")).toBeUndefined();
  });

  it("every operation of the contract has an operationId and the tags it is listed under", () => {
    expect(operations).toHaveLength(23);
    expect(operations.every((o) => o.id && o.tags.length === 1)).toBe(true);
  });

  it("reports a missing required header on its own, and ignores a bad traceparent", () => {
    const book = operation("bookAppointment");
    const input = (extra: Record<string, string>) => ({
      query: new URLSearchParams(),
      pathParams: {},
      headers: new Headers(extra),
      body: { kind: "json", value: {} } as const,
    });
    expect(validateRequest(book, input({}))).toEqual({
      ok: false,
      issues: [],
      missingHeaders: ["Idempotency-Key"],
    });
    const key = "00000000-0000-4000-8000-000000000001";
    expect(
      validateRequest(
        book,
        input({ "Idempotency-Key": key, traceparent: "junk".repeat(50) }),
      ).ok,
    ).toBe(true);
  });

  it("coerces query booleans and refuses repeated query parameters", () => {
    const list = operation("listAppointments");
    const run = (query: string) =>
      validateRequest(list, {
        query: new URLSearchParams(query),
        pathParams: {},
        headers: new Headers(),
        body: { kind: "none" },
      });
    expect(run("flagged=true&dealershipId=a")).toMatchObject({
      ok: true,
      query: { flagged: true, dealershipId: "a" },
    });
    expect(run("flagged=maybe")).toMatchObject({ ok: false });
    expect(run("date=2026-11-02&date=2026-11-03")).toMatchObject({ ok: false });
  });
});
