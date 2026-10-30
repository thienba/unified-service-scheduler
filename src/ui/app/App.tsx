import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  createMemoryRouter,
  Outlet,
  Route,
  RouterProvider,
} from "react-router";
import { createApiClient } from "../../api/client";
import { config, mockEnabled } from "../../config";
import { ToastProvider } from "../components/Toast";
import { createQueryClient } from "../data/query-client";
import { createDemoSupport, type DemoSupport } from "../demo/demo-session";
import { SessionProvider } from "../session/session";
import { appRoutes } from "./routes";

export interface AppProps {
  /** Where the API answers, and the `fetch` that answers: tests set them; the mock gives its healing `fetch`. */
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
  const [router] = useState(() => {
    const routes = createRoutesFromElements(
      <Route
        element={
          <ToastProvider>
            <SessionProvider client={client} demo={demo}>
              <Outlet />
            </SessionProvider>
          </ToastProvider>
        }
      >
        {props.routes ? <Route path="*" element={props.routes} /> : appRoutes}
      </Route>,
    );
    return props.initialEntries
      ? createMemoryRouter(routes, { initialEntries: props.initialEntries })
      : createBrowserRouter(routes);
  });
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
