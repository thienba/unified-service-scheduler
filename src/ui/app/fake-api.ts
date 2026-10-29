// A fake `fetch` for the screen tests: answers by method and path, and keeps what was asked.
export type FakeHandler = (request: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": "a".repeat(32),
    },
  });

export const problem = (status: number, code: string, extra = {}): Response =>
  json(
    {
      type: "about:blank",
      title: code,
      status,
      code,
      traceId: "4bf92f35a1b2c3d4e5f60718293a4b5c",
      ...extra,
    },
    status,
  );

export const demoUsers = [
  {
    id: "u-customer",
    name: "Aisha Rahman",
    role: "customer",
    dealershipIds: [],
  },
  {
    id: "u-staff",
    name: "Daniel Okoye",
    role: "staff",
    dealershipIds: ["d-leeds"],
  },
  {
    id: "u-both",
    name: "Dina Both",
    role: "staff",
    dealershipIds: ["d-leeds", "d-hcmc"],
  },
  {
    id: "u-manager",
    name: "Elena Petrova",
    role: "manager",
    dealershipIds: ["d-leeds"],
  },
];

export const dealerships = [
  { id: "d-leeds", name: "Northgate Motors", timeZone: "Europe/London" },
  { id: "d-hcmc", name: "Riverside Motors", timeZone: "Asia/Ho_Chi_Minh" },
];

export function fakeApi(handlers: Record<string, FakeHandler> = {}) {
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input) => {
    const request = input as Request;
    calls.push(request);
    const path = new URL(request.url).pathname.replace(/^\/api/, "");
    const handler = handlers[`${request.method} ${path}`];
    if (handler) return handler(request);
    const user = demoUsers.find(
      (u) => u.id === request.headers.get("X-Demo-User"),
    );
    switch (`${request.method} ${path}`) {
      case "GET /_demo/users":
        return json(demoUsers);
      case "GET /me":
        return user
          ? json({
              userId: user.id,
              name: user.name,
              role: user.role,
              customerId: null,
              dealershipIds: user.dealershipIds,
            })
          : problem(401, "UNKNOWN_USER");
      case "GET /dealerships":
        return json(dealerships);
      case "GET /appointments":
        return json([]);
      default:
        return problem(500, "INTERNAL");
    }
  };
  return { fetcher, calls };
}
