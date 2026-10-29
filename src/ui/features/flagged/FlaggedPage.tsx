// `flagged` (manager.md 4.2, 5.2; REQ-BOOK-005.AC-1, REQ-BOOK-007, REQ-BOOK-008.AC-4): every booking that no
// longer fits, soonest first, grouped by day, with the reason from the API (D-0001-34 A, D-0001-69). Move opens
// `adjust`; Cancel opens the same dialog as there. The rows repeat their actions, so the screen has no primary
// fill (design.md 8.5). Staff, customers and another dealership's `?dealership=` are stopped by the shell.
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge, TransportBadge, type Transport } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Plate } from "../../components/Small";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { call } from "../../data/api-problem";
import { formatDay, formatTime } from "../../format/format";
import { useSelectedDealership } from "../../session/dealership";
import { useSession } from "../../session/session";
import { CancelDialog } from "../adjust/CancelDialog";
import { flagBadgeWords } from "../adjust/adjust-model";
import { LoadFailed } from "../manage/parts";
import { vehicleText } from "../schedule/schedule-model";
import {
  afterCancelText,
  groupByDay,
  ledeText,
  rowName,
  type Appointment,
} from "./flagged-model";

export function FlaggedPage() {
  const { client } = useSession();
  const { selected } = useSelectedDealership();
  const id = selected?.id;
  const list = useQuery({
    queryKey: ["flagged-list", id],
    queryFn: () =>
      call(
        client.GET("/appointments", {
          params: { query: { dealershipId: id!, flagged: true } },
        }),
      ),
    enabled: id !== undefined,
  });
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [live, setLive] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  const now = Date.now();
  const count = list.data?.length ?? 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 ref={title} tabIndex={-1} className="text-2xl lg:text-3xl">
          Flagged bookings
        </h1>
        {list.data && count > 0 && (
          <p className="max-w-(--measure) text-text-secondary">
            {ledeText(count)}
          </p>
        )}
      </div>
      <p role="status" className="sr-only">
        {live}
      </p>
      {list.isError ? (
        <LoadFailed
          what="the flagged bookings"
          error={list.error}
          retry={() => void list.refetch()}
        />
      ) : !list.data ? (
        <StateBlock
          kind="loading"
          loadingLabel="Loading flagged bookings"
          skeleton={
            <>
              <Skeleton className="h-(--size-target) w-48" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          }
        />
      ) : count === 0 ? (
        <StateBlock
          kind="empty"
          headingLevel={2}
          title="Nothing needs your attention"
          actions={
            <Button variant="primary" to="/schedule">
              Open the schedule
            </Button>
          }
        >
          Every booking fits the opening hours and the technicians’ shifts. If
          you change hours or shifts and a booking no longer fits, it shows up
          here.
        </StateBlock>
      ) : (
        <div className="grid gap-6">
          {groupByDay(list.data, now).map((group) => (
            <section
              key={group.date}
              aria-labelledby={`day-${group.date}`}
              className="grid gap-1"
            >
              <h2
                id={`day-${group.date}`}
                className="flex flex-wrap items-baseline gap-x-3 text-lg"
              >
                {group.heading}{" "}
                <span className="font-sans text-sm font-normal text-text-secondary">
                  {group.count}
                </span>
              </h2>
              <ol className="m-0 list-none p-0">
                {group.appointments.map((a) => (
                  <FlaggedRow
                    key={a.id}
                    appointment={a}
                    now={now}
                    onCancel={() => setCancelling(a)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <CancelDialog
        appointment={cancelling}
        now={now}
        onClose={() => setCancelling(null)}
        onCancelled={() => {
          setCancelling(null);
          setLive(afterCancelText(Math.max(count - 1, 0)));
          // The row and its button are gone: the page title takes focus instead.
          requestAnimationFrame(() => title.current?.focus());
        }}
      />
    </div>
  );
}

function FlaggedRow({
  appointment: a,
  now,
  onCancel,
}: {
  appointment: Appointment;
  now: number;
  onCancel: () => void;
}) {
  const zone = a.timeZone;
  const kinds = [...new Set(a.flags.map((f) => f.kind))];
  const since = a.flags
    .map((f) => f.since)
    .sort()
    .at(0);
  const name = rowName(a, now);
  return (
    <li className="grid grid-cols-[var(--size-hour)_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-border-subtle px-2 py-4">
      <p className="num leading-snug font-semibold">
        <span className="sr-only">Time </span>
        {formatTime(a.start, zone)}
        <span className="block text-sm font-normal text-text-secondary">
          to {formatTime(a.end, zone)}
        </span>
      </p>
      <div className="grid min-w-0 justify-items-start gap-2">
        <p className="wrap-anywhere">
          <b>{a.display.serviceTypeName}</b>, {vehicleText(a)}{" "}
          <Plate>{a.display.vehicle.registration}</Plate>
        </p>
        <p className="text-sm text-text-secondary wrap-anywhere">
          <span dir="auto">{a.display.customerName}</span> ·{" "}
          <span dir="auto">{a.display.technicianName}</span>,{" "}
          {a.display.serviceBayName}
        </p>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Badge key={k} variant="flag" icon="alert">
              {flagBadgeWords[k]}
            </Badge>
          ))}
          <TransportBadge transport={a.transport as Transport} />
        </div>
        {a.flags.map((f) => (
          <p key={`${f.kind}-${f.reason}`} className="max-w-(--measure)">
            {f.reason}.
          </p>
        ))}
        {since && (
          <p className="text-sm text-text-secondary">
            Flagged on {formatDay(since, zone, now)}.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            icon="right"
            to={`/appointments/${a.id}/adjust`}
            aria-label={`Move ${name}`}
          >
            Move
          </Button>
          <Button
            aria-haspopup="dialog"
            aria-label={`Cancel ${name}`}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </li>
  );
}
