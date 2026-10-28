// Puts the mock API behind MSW (D-0000-3). The path pattern has no origin, so the same handlers answer
// the page's own origin and any other origin a test or a deployment points the client at.
import { http } from "msw";

export function createMswHandlers(
  api: (request: Request) => Promise<Response>,
) {
  return [http.all("*/api/*", ({ request }) => api(request))];
}
