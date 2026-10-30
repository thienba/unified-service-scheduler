// Everything the UI knows about the demo's users: the header that names one, the list of them, and
// where the choice is kept. A remote build never reaches this file (SEC-14.AC-1, D-0001-57).
import { createApiClient } from "../../api/client";
import type { components } from "../../api/contract/schema";
import { call } from "../data/api-problem";
import { readSavedUser, saveUser } from "./saved-user";

export const DEMO_USER_HEADER = "X-Demo-User";

/** Who a browser with no choice stored opens as (D-0001-145). */
export const DEFAULT_DEMO_USER = "user-customer-a";

export type DemoUser = components["schemas"]["DemoUserListing"];

export interface DemoSupport {
  /** The headers for every call: the picked user, if one is picked. */
  headers: () => Record<string, string>;
  userId: () => string | null;
  setUser: (id: string) => void;
  /** The seeded users. It uses a client with no headers: nobody is picked yet. */
  listUsers: () => Promise<DemoUser[]>;
  /**
   * Run before the first `GET /me`. A stored id the seed no longer has is replaced by the default, so the
   * call never answers 401 for it. Without the default in the list, nothing is changed.
   */
  settle: () => Promise<void>;
}

export function createDemoSupport(options: {
  baseUrl: string;
  fetch?: typeof fetch;
}): DemoSupport {
  let picked = readSavedUser();
  if (!picked) {
    picked = DEFAULT_DEMO_USER;
    saveUser(picked);
  }
  const plain = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const listUsers = () => call(plain.GET("/_demo/users"));
  return {
    headers: (): Record<string, string> =>
      picked ? { [DEMO_USER_HEADER]: picked } : {},
    userId: () => picked,
    setUser: (id) => {
      picked = id;
      saveUser(id);
    },
    listUsers,
    settle: async () => {
      const users = await listUsers();
      const has = (id: string | null) => users.some((u) => u.id === id);
      if (!has(picked) && has(DEFAULT_DEMO_USER)) {
        picked = DEFAULT_DEMO_USER;
        saveUser(picked);
      }
    },
  };
}
