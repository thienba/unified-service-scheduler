import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserRouter, MemoryRouter } from "react-router";
import { createApiClient } from "../../api/client";
import { config, mockEnabled } from "../../config";
import { ToastProvider } from "../components/Toast";
import { createQueryClient } from "../data/query-client";
import { createDemoSupport, type DemoSupport } from "../demo/demo-session";
import { SessionProvider } from "../session/session";
import { AppRoutes } from "./routes";

export interface AppProps {
  /** For tests: where the API answers, and the `fetch` that answers. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** For tests: start in memory at these addresses instead of the browser's. */
  initialEntries?: string[];
  /** For tests: the demo's user support, or `null` for none. */
  demo?: DemoSupport | null;
  /** For tests: the query cache to use, so a test can look inside it. */
  queryClient?: QueryClient;
  /** For tests: show this inside the providers instead of the routes. */
  routes?: ReactNode;
}

export function App(props: AppProps = {}) {
  const baseUrl = props.baseUrl ?? config.apiBaseUrl;
  const [demo] = useState<DemoSupport | null>(() =>
    props.demo !== undefined
      ? props.demo
      : mockEnabled
        ? createDemoSupport({
            baseUrl,
            ...(props.fetch ? { fetch: props.fetch } : {}),
          })
        : null,
  );
  const [client] = useState(() =>
    createApiClient({
      baseUrl,
      ...(props.fetch ? { fetch: props.fetch } : {}),
      ...(demo ? { headers: demo.headers } : {}),
    }),
  );
  const [queryClient] = useState(
    () => props.queryClient ?? createQueryClient(),
  );
  const routes = (
    <ToastProvider>
      <SessionProvider client={client} demo={demo}>
        {props.routes ?? <AppRoutes />}
      </SessionProvider>
    </ToastProvider>
  );
  return (
    <QueryClientProvider client={queryClient}>
      {props.initialEntries ? (
        <MemoryRouter initialEntries={props.initialEntries}>
          {routes}
        </MemoryRouter>
      ) : (
        <BrowserRouter>{routes}</BrowserRouter>
      )}
    </QueryClientProvider>
  );
}
