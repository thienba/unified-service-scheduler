// Tests for the policy helpers in policy-support.ts (Q-0001-253).
import { expect, test } from "@playwright/test";
import {
  type PolicyViolation,
  recordPolicyViolations,
  webKitSelectMessage,
  withoutWebKitSelectMessage,
} from "./policy-support";

const selectEvent: PolicyViolation = {
  directive: "style-src",
  blocked: "inline",
  target: "SELECT",
  source: ":0:0",
  selectCreation: false,
};
const otherStyleEvent: PolicyViolation = { ...selectEvent, target: "DIV" };
const line = `[customer] error: ${webKitSelectMessage}`;

test("the WebKit <select> message is taken out at most once per set-aside <select> event", () => {
  expect(
    withoutWebKitSelectMessage(
      [line, "other", line],
      [selectEvent, selectEvent],
      "webkit",
    ),
  ).toEqual(["other"]);
  // One event more than lines: nothing extra is taken out.
  expect(
    withoutWebKitSelectMessage([line], [selectEvent, selectEvent], "webkit"),
  ).toEqual([]);
  // A line without its own <select> event stays, so the test that uses it fails.
  expect(
    withoutWebKitSelectMessage([line, line], [selectEvent], "webkit"),
  ).toEqual([line]);
  expect(withoutWebKitSelectMessage([line], [], "webkit")).toEqual([line]);
  // An inline style on any other element is not a <select> event.
  expect(
    withoutWebKitSelectMessage([line], [otherStyleEvent], "webkit"),
  ).toEqual([line]);
});

test("in Firefox and Chromium nothing is taken out", () => {
  for (const browserName of ["firefox", "chromium"]) {
    expect(
      withoutWebKitSelectMessage([line], [selectEvent], browserName),
    ).toEqual([line]);
  }
});

test("a page with two native selects under the policy leaves no policy message once the known WebKit one is set aside", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  const violations = await recordPolicyViolations(context);
  const lines: string[] = [];
  page.on("console", (m) => lines.push(`${m.type()}: ${m.text()}`));
  const url = `${new URL(baseURL!).origin}/__policy-support-test`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
      },
      body: '<!doctype html><title>t</title><select aria-label="a"><option>One</option></select><select aria-label="b"><option>Two</option></select>',
    }),
  );
  await page.goto(url);
  await expect(page.getByRole("combobox")).toHaveCount(2);
  // Let the reports from the page reach the test.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  const messages = lines.filter((l) => l.endsWith(webKitSelectMessage));
  // WebKit raises one event per <select> and prints one line per event; the others raise none.
  expect(violations.length).toBe(browserName === "webkit" ? 2 : 0);
  expect(messages.length).toBe(violations.length);
  expect(
    withoutWebKitSelectMessage(lines, violations, browserName).filter((l) =>
      /Content Security Policy|Refused to|blocked|violat/i.test(l),
    ),
  ).toEqual([]);
});
