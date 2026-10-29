// design.md 8.17. Empty, loading, error, info, no-permission and not-found; `compact` is for use inside a page.
import type { ReactNode } from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { useAfterDelay } from "./hooks";
import { ShellContext } from "./shell-context";

export type StateKind =
  "empty" | "loading" | "error" | "info" | "no-permission" | "not-found";

const icons: Record<Exclude<StateKind, "loading">, IconName> = {
  empty: "plus",
  error: "alert",
  info: "info",
  "no-permission": "lock",
  "not-found": "alert",
};

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("skeleton", className)} />;
}

/** The first eight characters of a trace id: what a person can read out over the phone. */
export function referenceOf(traceId: string): string {
  return traceId.slice(0, 8);
}

function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button
        variant="quiet"
        icon="copy"
        aria-label={`Copy reference ${reference}`}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(reference)
            .then(() => setCopied(true));
        }}
      >
        Copy
      </Button>
      <span role="status" className="sr-only">
        {copied ? `Reference ${reference} copied` : ""}
      </span>
    </>
  );
}

export function StateBlock({
  kind,
  title,
  children,
  actions,
  traceId,
  compact = false,
  headingLevel = 1,
  focusTitle = false,
  loadingLabel,
  delay = 200,
  skeleton,
}: {
  kind: StateKind;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** An API error shows "Reference 4bf92f35" and a Copy button. */
  traceId?: string | null | undefined;
  compact?: boolean;
  headingLevel?: 1 | 2 | 3;
  /** Focus goes to the title when the block replaces the page's content. */
  focusTitle?: boolean;
  /** For `loading`: what is loading, said to a screen reader ("Loading appointments"). */
  loadingLabel?: string;
  /** For `loading`: how long to wait before the skeleton shows. */
  delay?: number;
  /** For `loading`: the skeleton in the final layout. */
  skeleton?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const visible = useAfterDelay(kind === "loading" ? delay : 0);
  const shell = useContext(ShellContext);
  useEffect(() => {
    if (focusTitle && (shell?.interacted.current ?? true))
      titleRef.current?.focus();
  }, [focusTitle, shell]);
  if (kind === "loading") {
    return (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          {loadingLabel ?? "Loading"}
        </span>
        {/* The skeleton always takes its space, so nothing jumps when it shows. */}
        <div
          className={cx("grid gap-3", !visible && "invisible")}
          aria-hidden="true"
        >
          {skeleton ?? (
            <>
              <Skeleton className="h-(--size-target)" />
              <Skeleton className="h-(--size-row)" />
              <Skeleton className="h-(--size-row)" />
            </>
          )}
        </div>
      </div>
    );
  }
  const Heading = (["h1", "h2", "h3"] as const)[headingLevel - 1]!;
  const reference = traceId ? referenceOf(traceId) : null;
  return (
    <section
      role={kind === "empty" ? undefined : kind === "info" ? "status" : "alert"}
      className={cx(
        "grid max-w-2xl justify-items-start gap-3 rounded-card border border-border-subtle bg-surface",
        compact ? "p-5" : "px-6 py-8",
      )}
    >
      <Icon name={icons[kind]} large />
      <Heading
        ref={titleRef}
        tabIndex={-1}
        className={cx(headingLevel === 1 ? "text-2xl lg:text-3xl" : "text-xl")}
      >
        {title}
      </Heading>
      {children && (
        <div className="max-w-(--measure) text-text-secondary">{children}</div>
      )}
      {(actions || reference) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {actions}
          {reference && (
            <>
              <span className="num text-sm text-text-secondary">
                Reference {reference}
              </span>
              <CopyReference reference={reference} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
