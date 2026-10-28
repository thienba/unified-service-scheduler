// The only place that reads `VITE_API_MODE` and `VITE_API_BASE_URL` (AD-15, SEC-14.AC-4).

export type ApiMode = "mock" | "remote";

export interface Config {
  apiMode: ApiMode;
  /** Where the API answers. In mock mode the page's own `/api`. */
  apiBaseUrl: string;
}

export interface RawEnv {
  VITE_API_MODE?: string | undefined;
  VITE_API_BASE_URL?: string | undefined;
}

/** `https://` addresses only, or `http://localhost` for a developer's own machine (SEC-14.AC-4). */
const allowedRemote = /^(https:\/\/|http:\/\/localhost([:/]|$))/;

export function readConfig(env: RawEnv): Config {
  const mode = env.VITE_API_MODE ?? "mock";
  if (mode !== "mock" && mode !== "remote") {
    throw new Error("VITE_API_MODE must be mock or remote.");
  }
  const apiBaseUrl = env.VITE_API_BASE_URL ?? "/api";
  if (mode === "remote" && !allowedRemote.test(apiBaseUrl)) {
    throw new Error(
      "VITE_API_BASE_URL must start with https:// (or http://localhost) in remote mode.",
    );
  }
  return { apiMode: mode, apiBaseUrl };
}

export const config: Config = readConfig({
  VITE_API_MODE: import.meta.env.VITE_API_MODE,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
});

/**
 * True unless the build is a remote one. It is a plain comparison, so a remote build can drop the
 * code behind it (the mock and the seed) instead of shipping it (SEC-14.AC-1).
 */
export const mockEnabled: boolean = import.meta.env.VITE_API_MODE !== "remote";
