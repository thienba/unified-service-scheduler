import { QueryClient } from "@tanstack/react-query";

/**
 * Writes are never retried by themselves (D-0000-20, AD-5): a failed POST is sent once, and the person
 * presses Try again, which sends it again with the same Idempotency-Key. Reads are not retried either,
 * so an error shows at once with its Try again button.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
