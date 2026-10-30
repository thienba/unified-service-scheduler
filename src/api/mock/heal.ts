// D-0001-142. A browser stops an idle service worker, and MSW's worker then forgets which tabs it answers
// for: the next `/api/` call goes past it to the host, which answers with the app's page. Every answer of the
// mock carries `X-Trace-Id`, so an answer without one, and not JSON, did not come from the mock. Then this tab asks the
// worker to answer for it again and sends the same request once more. The data lives in IndexedDB, not in
// the worker, so nothing is lost; a write that missed the mock saved nothing, so sending it again is safe.

/** Asks the worker that controls this tab to answer for it again, and waits for its reply (or 2 s). */
export async function reactivateWorker(
  container: ServiceWorkerContainer | undefined = globalThis.navigator
    ?.serviceWorker,
): Promise<void> {
  const worker = container?.controller;
  if (!container || !worker) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      container.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === "MOCKING_ENABLED")
        done();
    };
    const timer = setTimeout(done, 2000);
    container.addEventListener("message", onMessage);
    worker.postMessage("MOCK_ACTIVATE");
  });
}

/**
 * The mock's answers carry `X-Trace-Id`. A missed call gets the host's page or its 404 (HTML or text); a JSON
 * answer without the header is still read as an answer (a test's fake server, a remote backend's error).
 */
const fromMock = (answer: Response) =>
  answer.headers.has("X-Trace-Id") ||
  (answer.headers.get("Content-Type") ?? "").includes("json");

/** A `fetch` that sends a request again, once, after the mock missed it. */
export function createHealingFetch(deps: {
  fetch: (request: Request) => Promise<Response>;
  reactivate: () => Promise<void>;
}): typeof fetch {
  // Several calls can miss at once (a week of days); they share one re-activation.
  let pending: Promise<void> | null = null;
  const reactivate = () => {
    pending ??= deps.reactivate().finally(() => {
      pending = null;
    });
    return pending;
  };
  return async (input, init) => {
    // The body is read once into memory, so each send is a plain request (a cloned body would be a stream).
    const request = new Request(input, init);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const send = () =>
      deps.fetch(
        new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
          ...(body === undefined ? {} : { body }),
        }),
      );
    const answer = await send();
    if (fromMock(answer)) return answer;
    await reactivate();
    return send();
  };
}
