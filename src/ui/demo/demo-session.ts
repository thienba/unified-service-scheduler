// Everything the UI knows about the demo's users: the header that names one, the list of them, and
// where the choice is kept. A remote build never reaches this file (SEC-14.AC-1, D-0001-57).
import { createApiClient } from "../../api/client";
import type { components } from "../../api/contract/schema";
import { call } from "../data/api-problem";
import { readSavedUser, saveUser } from "./saved-user";

export const DEMO_USER_HEADER = "X-Demo-User";

export type DemoUser = components["schemas"]["DemoUserListing"];

export interface DemoSupport {
  /** The headers for every call: the picked user, if one is picked. */
  headers: () => Record<string, string>;
  userId: () => string | null;
  setUser: (id: string) => void;
  /** The seeded users. It uses a client with no headers: nobody is picked yet. */
  listUsers: () => Promise<DemoUser[]>;
}

export function createDemoSupport(options: {
  baseUrl: string;
  fetch?: typeof fetch;
}): DemoSupport {
  let picked = readSavedUser();
  const plain = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    headers: (): Record<string, string> =>
      picked ? { [DEMO_USER_HEADER]: picked } : {},
    userId: () => picked,
    setUser: (id) => {
      picked = id;
      saveUser(id);
    },
    listUsers: () => call(plain.GET("/_demo/users")),
  };
}
