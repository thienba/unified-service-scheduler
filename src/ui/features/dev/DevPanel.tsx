// `dev-panel` at /dev (manager.md 4.6 and 5.6, NFR-6). Demo only: routes.tsx adds it only when the mock is on,
// so a remote build holds none of it (SEC-14).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Skeleton, StateBlock } from "../../components/StateBlock";
import { useToast } from "../../components/Toast";
import { cx } from "../../components/cx";
import { ApiProblem, call } from "../../data/api-problem";
import { describeProblem } from "../../data/words";
import { useSession } from "../../session/session";
import { LogsPanel } from "./LogsPanel";
import { NumbersPanel } from "./NumbersPanel";
import { numbersOf } from "./telemetry";

export const telemetryKey = ["demo", "telemetry"] as const;

/** "Nothing was changed. Try again; if it keeps happening, quote reference 4bf92f35." */
function failureLine(error: unknown): string {
  return describeProblem(error).body;
}

function Title() {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl lg:text-3xl">Dev panel</h1>
        <Badge variant="confirmed" icon="info">
          Demo only
        </Badge>
      </div>
      <p className="max-w-(--measure) text-text-secondary">
        Logs and numbers from this browser tab, so you can follow what the app
        did. This page is not part of a real build.
      </p>
    </div>
  );
}

function ResetSection() {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const reset = useMutation({
    mutationFn: () => call(client.POST("/_demo/reset")),
    onSuccess: async () => {
      setOpen(false);
      toast.show({
        kind: "success",
        message: "Demo data reset. The starting data is loaded again.",
      });
      // Every screen's data came from before the reset: read it again.
      await queryClient.invalidateQueries();
    },
  });
  const close = () => {
    if (reset.isPending) return;
    setOpen(false);
    reset.reset();
  };
  return (
    <section
      aria-labelledby="dev-reset"
      className="grid min-w-0 content-start gap-4 rounded-card border border-border-subtle bg-surface p-5"
    >
      <h2 id="dev-reset" className="text-xl">
        Reset demo data
      </h2>
      <p className="max-w-(--measure)">
        Put the demo back to its starting data. This clears every booking,
        customer, message and number you made in this browser. Other browsers
        are not touched.
      </p>
      {reset.isSuccess && (
        <p className="flex items-start gap-2">
          <Icon name="check" className="mt-0.5 text-text-success" />
          <span>Demo data is back to the start.</span>
        </p>
      )}
      <div>
        <Button
          icon="refresh"
          aria-haspopup="dialog"
          onClick={() => {
            reset.reset();
            setOpen(true);
          }}
        >
          Reset demo data
        </Button>
      </div>
      <Dialog
        open={open}
        title="Reset all demo data?"
        onClose={close}
        destructive
        busy={reset.isPending}
        initialFocus={keep}
        actions={
          <>
            <Button ref={keep} disabled={reset.isPending} onClick={close}>
              Keep my data
            </Button>
            <Button
              variant="danger"
              loading={reset.isPending}
              loadingLabel="Resetting…"
              onClick={() => reset.mutate()}
            >
              Reset demo data
            </Button>
          </>
        }
      >
        <p>
          This deletes every booking, customer, message and number you made in
          this browser, and loads the starting data again. It cannot be undone.
          Other browsers are not affected.
        </p>
        {reset.isError && (
          <Alert
            kind="danger"
            title="We could not reset the demo data"
            focusTitle
          >
            <p>{failureLine(reset.error)}</p>
          </Alert>
        )}
      </Dialog>
    </section>
  );
}

export function DevPanel() {
  const { client } = useSession();
  const [view, setView] = useState<"numbers" | "logs">("numbers");
  // The page's own start: the tab's numbers are counted from when it loaded (the mock starts with the page).
  const [since] = useState(() => performance.timeOrigin);
  const telemetry = useQuery({
    queryKey: telemetryKey,
    queryFn: () => call(client.GET("/_demo/telemetry")),
  });

  let body;
  if (telemetry.isPending) {
    body = (
      <StateBlock
        kind="loading"
        loadingLabel="Loading the numbers and logs"
        skeleton={
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="grid gap-3 lg:col-span-5">
              <Skeleton className="h-(--size-hour)" />
              <Skeleton className="h-(--size-hour)" />
              <Skeleton className="h-(--size-hour)" />
            </div>
            <div className="grid gap-3 lg:col-span-7">
              <Skeleton className="h-(--size-hour)" />
              <Skeleton className="h-(--size-hour)" />
              <Skeleton className="h-(--size-hour)" />
            </div>
          </div>
        }
      />
    );
  } else if (telemetry.isError) {
    const error = telemetry.error;
    body = (
      <StateBlock
        kind="error"
        title="We could not load the numbers and logs."
        headingLevel={2}
        traceId={error instanceof ApiProblem ? error.traceId : null}
        focusTitle
        actions={
          <Button
            variant="primary"
            icon="refresh"
            onClick={() => void telemetry.refetch()}
          >
            Try again
          </Button>
        }
      >
        {failureLine(error)}
      </StateBlock>
    );
  } else if (telemetry.data.logs.length === 0) {
    body = (
      <>
        <StateBlock
          kind="empty"
          title="No requests yet"
          headingLevel={2}
          actions={<EmptyAction />}
        >
          Use the app (book a time, adjust an appointment), then come back.
          Every request is logged here with a reference you can quote.
        </StateBlock>
        <ResetSection />
      </>
    );
  } else {
    body = (
      <>
        <div className="lg:hidden">
          <SegmentedControl
            label="Show"
            options={[
              { value: "numbers", label: "Numbers" },
              { value: "logs", label: "Logs" },
            ]}
            value={view}
            onChange={(v) => setView(v as "numbers" | "logs")}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div
            className={cx(
              "min-w-0 lg:col-span-5 lg:block",
              view === "logs" && "hidden",
            )}
          >
            <NumbersPanel numbers={numbersOf(telemetry.data)} since={since} />
          </div>
          <div
            className={cx(
              "min-w-0 lg:col-span-7 lg:block",
              view === "numbers" && "hidden",
            )}
          >
            <LogsPanel logs={telemetry.data.logs} />
          </div>
        </div>
        <ResetSection />
      </>
    );
  }

  return (
    <div className="grid gap-6">
      <Title />
      {body}
    </div>
  );
}

function EmptyAction() {
  const { me } = useSession();
  return me?.role === "customer" ? (
    <Button variant="primary" to="/book">
      Open Book a service
    </Button>
  ) : (
    <Button variant="primary" to="/schedule">
      Open the schedule
    </Button>
  );
}
