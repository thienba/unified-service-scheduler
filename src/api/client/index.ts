// The typed client the screens use (AD-2, AD-5, AD-12). It knows only the contract's generated types
// and the base URL it is given; it does not know whether a mock or a real backend answers.
import createClient, { type Client } from "openapi-fetch";
import type { paths } from "../contract/schema";

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** Where the API answers, from `src/config`. */
  baseUrl: string;
  /**
   * Extra headers for every call. In the demo this names the user picked in the role switcher; a real
   * backend gets none and signs the call another way. Nothing demo-only is written in this file
   * (SEC-14.AC-1).
   */
  headers?: () => Record<string, string>;
  /** For tests; the default is the page's `fetch`, looked up at call time. */
  fetch?: typeof fetch;
}

const hex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** A W3C `traceparent` with a new trace id and span id (AD-12). */
export function newTraceparent(): string {
  return `00-${hex(16)}-${hex(8)}-01`;
}

/**
 * One Confirm press. Its key is made when the user presses Confirm and is sent again on every retry
 * of that press, so a double-click or a retry makes one booking (AD-5). A new press makes a new key.
 */
export interface ConfirmPress {
  readonly key: string;
}

export function startConfirmPress(): ConfirmPress {
  return { key: crypto.randomUUID() };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: options.fetch ?? ((request) => globalThis.fetch(request)),
  });
  client.use({
    onRequest({ request }) {
      request.headers.set("traceparent", newTraceparent());
      for (const [name, value] of Object.entries(options.headers?.() ?? {})) {
        request.headers.set(name, value);
      }
      return request;
    },
  });
  return client;
}
