// The one route table (design.md section 5, D-0000-19) and the one guard. This file adds only `/` and `*`
// itself; each screen's own ticket adds its screen to `screens` below, next to the path it is for.
import type { ReactElement, ReactNode } from "react";
import { Navigate, Route, useSearchParams } from "react-router";
import { mockEnabled } from "../../config";
import { InlineNote } from "../components/Small";
import { StateBlock } from "../components/StateBlock";
import { useSelectedDealership } from "../session/dealership";
import { useSession } from "../session/session";
import { ComponentSheet } from "../pages/ComponentSheet";
import { BookPage } from "../features/book/BookPage";
import { BookCustomerPage } from "../features/book/BookCustomerPage";
import { ConfirmedPage } from "../features/book/ConfirmedPage";
import { AppointmentPage } from "../features/appointment/AppointmentPage";
import { SchedulePage } from "../features/schedule/SchedulePage";
import { DealershipSettingsPage } from "../features/manage/DealershipSettingsPage";
import { ShiftsPage } from "../features/manage/ShiftsPage";
import { OutboxScreen } from "../features/outbox/OutboxScreen";
import { DevPanel } from "../features/dev/DevPanel";
import {
  devPanelPath,
  homeFor,
  mayOpen,
  routeRules,
  type RouteRule,
} from "./guard";
import { Shell } from "./Shell";
import {
  NoPermission,
  OtherDealership,
  PageNotFound,
  ProblemState,
  SignedOut,
} from "./states";

/** A screen for each path of `routeRules`. A path with no screen yet shows its title only. */
const screens: Record<string, ReactElement> = {
  "/book": <BookPage />,
  "/book/confirmed/:appointmentId": <ConfirmedPage />,
  "/book/for-customer": <BookCustomerPage />,
  "/schedule": <SchedulePage />,
  "/appointments/:appointmentId": <AppointmentPage />,
  "/manage/dealership": <DealershipSettingsPage />,
  "/manage/shifts": <ShiftsPage />,
  "/manage/outbox": <OutboxScreen />,
  // Demo only: in a remote build `mockEnabled` is false, so the panel is left out of the bundle (SEC-14).
  ...(mockEnabled ? { [devPanelPath]: <DevPanel /> } : {}),
};

const rules: readonly RouteRule[] = mockEnabled
  ? [
      ...routeRules,
      {
        path: devPanelPath,
        roles: ["customer", "staff", "manager"],
        denied: "schedule",
        title: "Dev panel",
      },
    ]
  : routeRules;

function Loading() {
  return <StateBlock kind="loading" loadingLabel="Loading" />;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl lg:text-3xl">{title}</h1>
      <InlineNote>This screen comes in a later step.</InlineNote>
    </div>
  );
}

function Guarded({ rule, children }: { rule: RouteRule; children: ReactNode }) {
  const { status, me, problem, reload, switcher } = useSession();
  const dealership = useSelectedDealership();
  const [params] = useSearchParams();
  if (status === "loading" || switcher?.switching) return <Loading />;
  if (status === "signed-out") return <SignedOut />;
  if (status === "error" || me === null)
    return <ProblemState error={problem} retry={reload} />;
  if (!mayOpen(rule, me.role)) {
    return <NoPermission denied={rule.denied} role={me.role} />;
  }
  if (params.has("dealership") && dealership.loading) return <Loading />;
  const own = dealership.options[0];
  if (dealership.foreign && own) {
    return (
      <OtherDealership
        role={me.role}
        ownName={own.name}
        otherName={dealership.foreign.name}
      />
    );
  }
  return children;
}

function Home() {
  const { status, me, problem, reload } = useSession();
  if (status === "loading") return <Loading />;
  if (status === "signed-out") return <SignedOut />;
  if (status === "error" || me === null)
    return <ProblemState error={problem} retry={reload} />;
  return <Navigate to={homeFor(me.role)} replace />;
}

function NotFoundPage() {
  const { me } = useSession();
  return <PageNotFound role={me?.role ?? null} />;
}

/** The route table, placed inside the data router's root route (D-0001-75): `useBlocker` needs a data router. */
export const appRoutes = (
  <Route element={<Shell />}>
    <Route index element={<Home />} />
    {rules.map((rule) => (
      <Route
        key={rule.path}
        path={rule.path}
        element={
          <Guarded rule={rule}>
            {screens[rule.path] ?? <Placeholder title={rule.title} />}
          </Guarded>
        }
      />
    ))}
    {mockEnabled && <Route path="components" element={<ComponentSheet />} />}
    <Route path="*" element={<NotFoundPage />} />
  </Route>
);
