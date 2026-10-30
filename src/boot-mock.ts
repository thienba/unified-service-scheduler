// The demo's backend, started in the page: the IndexedDB store, the seed, the application and the MSW
// worker (architecture.md section 7.1, AD-15). Only `main.tsx` loads this file, and only in mock mode.
import { setupWorker } from "msw/browser";
import { createApi } from "./api/mock/api";
import { createHealingFetch, reactivateWorker } from "./api/mock/heal";
import { createMswHandlers } from "./api/mock/msw";
import { loadSeed, resetToSeed } from "./infrastructure/seed/seed-loader";
import { createTelemetry } from "./infrastructure/telemetry";
import { createDexieRepository } from "./infrastructure/storage/dexie/dexie-repository";

/** Starts the mock, and gives the `fetch` the app must use: it heals a worker the browser stopped (D-0001-142). */
export async function bootMock(): Promise<{ fetch: typeof fetch }> {
  const repository = createDexieRepository("unified-service-scheduler");
  await loadSeed(repository, Date.now());
  const clock = { now: () => Date.now() };
  const { logger, metrics, reader } = createTelemetry({ now: clock.now });
  const api = createApi({
    repository,
    clock,
    ids: { next: () => crypto.randomUUID() },
    logger,
    metrics,
    telemetry: reader,
    resetData: () => resetToSeed(repository, Date.now()),
  });
  await setupWorker(...createMswHandlers(api)).start({
    onUnhandledFrame: "bypass",
    quiet: true,
  });
  return {
    fetch: createHealingFetch({
      fetch: (request) => globalThis.fetch(request),
      reactivate: () => reactivateWorker(),
    }),
  };
}
