import { describe, expect, it, vi } from "vitest";
import { createHealingFetch, reactivateWorker } from "./heal";

const fromMock = (body = "[]") =>
  new Response(body, {
    headers: { "Content-Type": "application/json", "X-Trace-Id": "t1" },
  });
/** What the host answers when the call went past the worker: the app's page. */
const page = () =>
  new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });

function setup(answers: (() => Response)[]) {
  const sent: Request[] = [];
  const reactivate = vi.fn(async () => {});
  const healing = createHealingFetch({
    fetch: async (request) => {
      sent.push(request);
      return answers.shift()!();
    },
    reactivate,
  });
  return { healing, sent, reactivate };
}

describe("the healing fetch (D-0001-142)", () => {
  it("passes an answer from the mock straight through, with no re-activation", async () => {
    const { healing, sent, reactivate } = setup([() => fromMock("[1]")]);
    const answer = await healing("https://x.test/api/service-types");
    expect(await answer.text()).toBe("[1]");
    expect(sent).toHaveLength(1);
    expect(reactivate).not.toHaveBeenCalled();
  });

  it("re-activates the worker and sends the same request once more when the mock missed it", async () => {
    const { healing, sent, reactivate } = setup([page, () => fromMock("[2]")]);
    const answer = await healing("https://x.test/api/appointments", {
      method: "POST",
      body: '{"a":1}',
      headers: { "Idempotency-Key": "k1" },
    });
    expect(await answer.text()).toBe("[2]");
    expect(reactivate).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.method).toBe("POST");
    expect(sent[1]!.headers.get("Idempotency-Key")).toBe("k1");
    expect(await sent[1]!.text()).toBe('{"a":1}');
  });

  it("reads a JSON answer without the header as an answer, not a miss", async () => {
    const { healing, sent, reactivate } = setup([
      () =>
        new Response('{"code":"INTERNAL"}', {
          status: 500,
          headers: { "Content-Type": "application/problem+json" },
        }),
    ]);
    const answer = await healing("https://x.test/api/appointments", {
      method: "POST",
      body: "{}",
    });
    expect(answer.status).toBe(500);
    expect(sent).toHaveLength(1);
    expect(reactivate).not.toHaveBeenCalled();
  });

  it("does not try a third time: a second miss is returned as it is", async () => {
    const { healing, sent, reactivate } = setup([page, page]);
    const answer = await healing("https://x.test/api/service-types");
    expect(answer.headers.get("Content-Type")).toBe("text/html");
    expect(sent).toHaveLength(2);
    expect(reactivate).toHaveBeenCalledTimes(1);
  });

  it("calls that miss at the same time share one re-activation", async () => {
    let release!: () => void;
    const reactivate = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    let calls = 0;
    const healing = createHealingFetch({
      fetch: async () => (++calls <= 3 ? page() : fromMock()),
      reactivate,
    });
    const all = Promise.all(
      [1, 2, 3].map(() => healing("https://x.test/api/a")),
    );
    await vi.waitFor(() => expect(reactivate).toHaveBeenCalled());
    release();
    const answers = await all;
    expect(answers.every((a) => a.headers.has("X-Trace-Id"))).toBe(true);
    expect(reactivate).toHaveBeenCalledTimes(1);
  });
});

describe("reactivateWorker", () => {
  function container(reply: boolean) {
    const target = new EventTarget();
    const posted: unknown[] = [];
    const controller = {
      postMessage: (message: unknown) => {
        posted.push(message);
        if (reply)
          queueMicrotask(() =>
            target.dispatchEvent(
              new MessageEvent("message", {
                data: { type: "MOCKING_ENABLED" },
              }),
            ),
          );
      },
    };
    return {
      posted,
      target: Object.assign(target, {
        controller,
      }) as unknown as ServiceWorkerContainer,
    };
  }

  it("sends MOCK_ACTIVATE to the controlling worker and waits for MOCKING_ENABLED", async () => {
    const { posted, target } = container(true);
    await reactivateWorker(target);
    expect(posted).toEqual(["MOCK_ACTIVATE"]);
  });

  it("gives up waiting after 2 seconds when the worker does not answer", async () => {
    vi.useFakeTimers();
    try {
      const { posted, target } = container(false);
      const done = reactivateWorker(target);
      await vi.advanceTimersByTimeAsync(2000);
      await done;
      expect(posted).toEqual(["MOCK_ACTIVATE"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing when no worker controls the page", async () => {
    await expect(reactivateWorker(undefined)).resolves.toBeUndefined();
    const bare = Object.assign(new EventTarget(), {
      controller: null,
    }) as unknown as ServiceWorkerContainer;
    await expect(reactivateWorker(bare)).resolves.toBeUndefined();
  });
});
