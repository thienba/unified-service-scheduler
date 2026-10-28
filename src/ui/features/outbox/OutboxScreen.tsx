// The manager's outbox (manager.md 4.5, 5.5; REQ-BOOK-013). A Read screen: "what did the customer get, and
// what is still to come?". Nothing is sent: the screen shows what would go out (D-0001-22 e, D-0001-50 B).
import { useId, useMemo, useState } from "react";
import {
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { query, useMediaQuery } from "../../components/hooks";
import { ApiProblem, call } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { placeOfZone, viewerTimeZone, zoneNote } from "../../format/format";
import { ProblemState } from "../../app/states";
import {
  useDealerships,
  useSelectedDealership,
} from "../../session/dealership";
import { useSession } from "../../session/session";
import { MessageDetails, MessagePane } from "./MessagePane";
import { MessageRow } from "./MessageRow";
import {
  buildGroups,
  countsOf,
  filterEmptyWords,
  type Appointment,
  type Filter,
  type GroupView,
} from "./outbox-view";

const filterLabels: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent in this demo" },
  { value: "cancelled", label: "Cancelled" },
];

function Head({ zone }: { zone: string | undefined }) {
  return (
    <div className="grid gap-2">
      <h1 className="text-2xl lg:text-3xl">Outbox</h1>
      <p className="m-0 max-w-(--measure) text-text-secondary">
        The messages the system would send to customers, and when.
        {zone ? ` Times are ${placeOfZone(zone)} time.` : ""}
      </p>
    </div>
  );
}

function Loading({ zone }: { zone: string | undefined }) {
  return (
    <div className="grid gap-6">
      <Head zone={zone} />
      <StateBlock
        kind="loading"
        loadingLabel="Loading the outbox"
        skeleton={
          <>
            <Skeleton className="h-(--size-target)" />
            {[1, 2, 3, 4, 5].map((n) => (
              <Skeleton key={n} className="h-(--size-row)" />
            ))}
          </>
        }
      />
    </div>
  );
}

export function OutboxScreen() {
  const { client, me } = useSession();
  const queryClient = useQueryClient();
  const dealerships = useDealerships();
  const { selected } = useSelectedDealership();
  const [params, setParams] = useSearchParams();
  const appointmentId = params.get("appointmentId") ?? undefined;
  // The filter and the open message belong to one view: a new `?appointmentId` (a link, back or forward)
  // starts again from "All" with nothing open, so a hidden filter never hides rows.
  const [view, setView] = useState<{
    for: string | undefined;
    filter: Filter;
    openId: string | null;
  }>({ for: appointmentId, filter: "all", openId: null });
  const current =
    view.for === appointmentId
      ? view
      : { for: appointmentId, filter: "all" as Filter, openId: null };
  // Kept, not only shown: coming back to the whole outbox later starts from "All" too.
  if (current !== view) setView(current);
  const { filter, openId } = current;
  const setFilter = (next: Filter) => setView({ ...current, filter: next });
  const setOpenId = (next: string | null) =>
    setView({ ...current, openId: next });
  const wide = useMediaQuery(query.lg);
  const idPrefix = useId();

  const outbox = useQuery({
    queryKey: ["outbox", selected?.id, appointmentId],
    queryFn: () =>
      call(
        client.GET("/outbox", {
          params: {
            query: {
              dealershipId: selected!.id,
              ...(appointmentId === undefined ? {} : { appointmentId }),
            },
          },
        }),
      ),
    enabled: selected !== undefined,
  });
  const ids = [...new Set((outbox.data ?? []).map((m) => m.appointmentId))];
  const appointments = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["outbox", "appointment", id],
      queryFn: () =>
        call(
          client.GET("/appointments/{appointmentId}", {
            params: { path: { appointmentId: id } },
          }),
        ),
    })),
    combine: (results: UseQueryResult<Appointment>[]) => ({
      pending: results.some((r) => r.isPending),
      error: results.find((r) => r.isError)?.error ?? null,
      byId: new Map(
        results.flatMap((r) => (r.data ? [[r.data.id, r.data] as const] : [])),
      ),
    }),
  });

  const zone = selected?.timeZone;
  const now = outbox.dataUpdatedAt;
  const groups = useMemo<GroupView[]>(
    () =>
      zone && selected && outbox.data && !appointments.pending
        ? buildGroups(outbox.data, appointments.byId, {
            zone,
            now,
            dealershipName: selected.name,
            origin: window.location.origin,
          })
        : [],
    [zone, selected, outbox.data, appointments, now],
  );

  const error = dealerships.error ?? outbox.error ?? appointments.error;
  if (error) {
    const words = describeProblem(error, { role: me?.role });
    const retry = () => {
      void dealerships.refetch();
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    };
    if (words.kind !== "error") {
      return (
        <ProblemState
          error={error}
          retry={retry}
          context={{ scope: "dealership" }}
        />
      );
    }
    return (
      <div className="grid gap-6">
        <Head zone={zone} />
        <StateBlock
          kind="error"
          title={words.title}
          headingLevel={2}
          traceId={error instanceof ApiProblem ? error.traceId : null}
          focusTitle
          actions={
            <Button variant="primary" icon="refresh" onClick={retry}>
              Try again
            </Button>
          }
        >
          We could not load the outbox. {words.body}
        </StateBlock>
      </div>
    );
  }
  if (!selected || outbox.isPending || appointments.pending) {
    return <Loading zone={zone} />;
  }

  const counts = countsOf(groups);
  const zoneWords = zoneNote(selected.timeZone, viewerTimeZone());
  const open =
    groups
      .flatMap((group) => group.messages.map((message) => ({ group, message })))
      .find((x) => x.message.id === openId) ?? null;

  if (counts.all === 0) {
    return (
      <div className="grid gap-6">
        <Head zone={zone} />
        <StateBlock
          kind="empty"
          title="No messages yet"
          headingLevel={2}
          actions={
            <Button variant="primary" to="/schedule">
              Open the schedule
            </Button>
          }
        >
          A message appears here when a booking is confirmed, moved or
          cancelled, and when a reminder is scheduled.
        </StateBlock>
      </div>
    );
  }

  const filters = (
    <SegmentedControl
      label="Show messages"
      className="flex-wrap"
      value={filter}
      onChange={(value) => setFilter(value as Filter)}
      options={filterLabels.map((f) => ({
        value: f.value,
        label: `${f.label} (${counts[f.value]})`,
      }))}
    />
  );

  if (filter !== "all" && counts[filter] === 0) {
    const words = filterEmptyWords[filter];
    return (
      <div className="grid gap-6">
        <Head zone={zone} />
        <div>{filters}</div>
        <StateBlock
          kind="empty"
          title={words.title}
          headingLevel={2}
          actions={
            <Button variant="primary" onClick={() => setFilter("all")}>
              Show all messages
            </Button>
          }
        >
          {words.body}
        </StateBlock>
      </div>
    );
  }

  const shown = groups
    .map((g) => ({
      ...g,
      messages: g.messages.filter(
        (m) => filter === "all" || m.state === filter,
      ),
    }))
    .filter((g) => g.messages.length > 0);
  const only = appointmentId === undefined ? null : groups[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Head zone={zone} />
        <Alert kind="info" title="Nothing is sent in this demo">
          <p>
            You see what would go out. No text message or email leaves this
            browser.
          </p>
        </Alert>
      </div>
      {only ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-text-link bg-info-tint p-5">
          <Icon name="info" large className="text-text-link" />
          <p className="m-0 min-w-0 flex-1 basis-60">
            Showing the messages for <b>{only.summary}</b>.
          </p>
          <Button
            onClick={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete("appointmentId");
                return next;
              })
            }
          >
            Show all messages
          </Button>
        </div>
      ) : (
        <div>{filters}</div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="grid min-w-0 content-start gap-6">
          {shown.map((g, i) => (
            <section
              key={g.appointmentId}
              aria-labelledby={`${idPrefix}-${i}`}
              className="grid gap-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2
                  id={`${idPrefix}-${i}`}
                  className="num min-w-0 text-lg wrap-anywhere"
                >
                  {g.heading}
                </h2>
                <Button
                  variant="quiet"
                  to={`/appointments/${g.appointmentId}`}
                  aria-label={`Open appointment, ${g.summary}`}
                >
                  Open appointment
                </Button>
              </div>
              <p className="num m-0 text-sm text-text-secondary">{g.subLine}</p>
              <ul className="m-0 mt-2 list-none p-0">
                {g.messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    selected={m.id === openId}
                    opensDialog={!wide}
                    onOpen={(id) =>
                      // On desktop the row is a toggle: pressing the open one again closes it.
                      setOpenId(wide && id === openId ? null : id)
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        {wide && <MessagePane open={open} zoneNote={zoneWords} />}
      </div>
      {!wide && open && (
        <Dialog
          open
          title={open.message.kindLabel}
          onClose={() => setOpenId(null)}
          actions={<Button onClick={() => setOpenId(null)}>Close</Button>}
        >
          <MessageDetails
            message={open.message}
            group={open.group}
            zoneNote={zoneWords}
          />
        </Dialog>
      )}
    </div>
  );
}
