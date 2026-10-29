// The demo's backend, started in the page: the IndexedDB store, the seed, the application and the MSW
// worker (architecture.md section 7.1, AD-15). Only `main.tsx` loads this file, and only in mock mode.
import { setupWorker } from "msw/browser";
import { createApi } from "./api/mock/api";
import { createMswHandlers } from "./api/mock/msw";
import { loadSeed } from "./infrastructure/seed/seed-loader";
import { createDexieRepository } from "./infrastructure/storage/dexie/dexie-repository";

export async function bootMock(): Promise<void> {
  const repository = createDexieRepository("keyloop-scheduler");
  await loadSeed(repository, Date.now());
  const api = createApi({
    repository,
    clock: { now: () => Date.now() },
    ids: { next: () => crypto.randomUUID() },
    // The real logger and counters come with the telemetry ticket.
    logger: { info: () => {}, step: (_name, work) => work() },
    metrics: { increment: () => {}, observe: () => {} },
  });
  await setupWorker(...createMswHandlers(api)).start({
    onUnhandledFrame: "bypass",
    quiet: true,
  });
}
