// Content Security Policy checks for the end-to-end tests (SEC-15.AC-3, SEC-11.AC-3).
//
// Every page in a test context reports each `securitypolicyviolation` event to the test, with the
// element it was raised on. One kind is known and is not ours: WebKit raises an inline-style violation
// for every native `<select>` element on a page whose policy has no 'unsafe-inline' for styles, and
// prints "Refused to apply a stylesheet ..." in the console. It comes from WebKit's own built-in parts
// of the control (a bare `<select>` on an empty page does the same). The only thing lost is the "..."
// on a long chosen option (WebKit cuts the text at the edge instead). Firefox and Chromium report
// nothing for the same page. See the ticket
// 2026-10-29-content-security-policy-messages-in-firefox-and-webkit and Q-0001-253.
import type { BrowserContext } from "@playwright/test";

export interface PolicyViolation {
  directive: string;
  blocked: string;
  /** The tag name of the element the event was raised on, or "document". */
  target: string;
  source: string;
  /** True when the browser reports the violation at the line that creates a `<select>` element. */
  selectCreation: boolean;
}

/** WebKit's console text for the known `<select>` case. */
export const webKitSelectMessage =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' appears in neither the style-src directive nor the default-src directive of the Content Security Policy.";

/** Starts recording the policy violations of every page in the context. Call before opening pages. */
export async function recordPolicyViolations(
  context: BrowserContext,
): Promise<PolicyViolation[]> {
  const seen: PolicyViolation[] = [];
  await context.exposeBinding(
    "__reportPolicyViolation",
    (_source, violation: PolicyViolation) => {
      seen.push(violation);
    },
  );
  await context.addInitScript(() => {
    // A `<select>` made by script (React) is not in the page yet, so WebKit raises the event on the
    // document, not on the element, and gives the line of script that made it. Every `<select>` is
    // made on one marked line here, so such an event can still be tied to a `<select>`.
    const create = Document.prototype.createElement;
    let selectLine = "";
    const lineOf = (marker: Error) =>
      // A frame reads "name@file:line:column"; keep "file:line".
      /([^@\s]+):(\d+):\d+$/
        .exec(marker.stack?.split("\n")[0] ?? "")
        ?.slice(1, 3)
        .join(":") ?? "";
    Document.prototype.createElement = function (
      this: Document,
      name: string,
      options?: ElementCreationOptions,
    ) {
      if (String(name).toLowerCase() !== "select") {
        return create.call(this, name, options);
      }
      const [element, marker] = [create.call(this, name, options), Error()];
      selectLine ||= lineOf(marker);
      return element;
    } as typeof Document.prototype.createElement;
    document.addEventListener(
      "securitypolicyviolation",
      (event) => {
        const target = event.target;
        const report = (
          window as unknown as {
            __reportPolicyViolation: (v: unknown) => Promise<void>;
          }
        ).__reportPolicyViolation;
        void report({
          directive: event.violatedDirective,
          blocked: event.blockedURI,
          target: target instanceof Element ? target.tagName : "document",
          source: `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
          selectCreation:
            selectLine !== "" &&
            `${event.sourceFile}:${event.lineNumber}` === selectLine,
        });
      },
      true,
    );
  });
  return seen;
}

/** True for WebKit's own inline style on a native `<select>` (see the top of this file). */
export function isWebKitSelectStyle(
  violation: PolicyViolation,
  browserName: string,
): boolean {
  return (
    browserName === "webkit" &&
    (violation.target === "SELECT" || violation.selectCreation) &&
    violation.blocked === "inline" &&
    violation.directive.startsWith("style-src")
  );
}

/** The console lines left once WebKit's known `<select>` message is taken out (WebKit only). */
export function withoutWebKitSelectMessage(
  lines: string[],
  browserName: string,
): string[] {
  return browserName === "webkit"
    ? lines.filter((line) => !line.endsWith(webKitSelectMessage))
    : lines;
}
