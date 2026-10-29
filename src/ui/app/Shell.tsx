// design.md 8.1. Skip link, header (brand, dealership picker, role switcher), navigation, the page, the footer.
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { mockEnabled } from "../../config";
import { IconSprite } from "../components/Icon";
import { query, useMediaQuery } from "../components/hooks";
import { ShellContext, type ShellValue } from "../components/shell-context";
import { ToastViewport } from "../components/Toast";
import { DealershipPicker } from "../session/DealershipPicker";
import { RoleSwitcher } from "../session/RoleSwitcher";
import { useSession } from "../session/session";
import { devPanelPath } from "./guard";
import { PrimaryNav } from "./PrimaryNav";

export function Shell() {
  const { me, status, switcher } = useSession();
  const lg = useMediaQuery(query.lg);
  const md = useMediaQuery(query.md);
  const [task, setTask] = useState<{ hideFrom: "md" | "lg" } | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const first = useRef(true);
  const interacted = useRef(false);

  useEffect(() => {
    const mark = () => {
      interacted.current = true;
    };
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  // A new page starts at its top: focus moves to the page, not to wherever the last one left it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    interacted.current = true;
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  const role = me?.role ?? null;
  const showsNav = status === "ready" && role !== null;
  const stepsAside = task !== null && !(task.hideFrom === "md" ? md : lg);
  const tabBar = showsNav && !lg && !stepsAside;
  const barShowing = tabBar || task !== null;
  const shell: ShellValue = { setTask, actionBarSlot: slot, interacted };

  return (
    <ShellContext value={shell}>
      <IconSprite />
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="absolute start-2 -top-32 z-(--z-toast) rounded-control bg-surface px-4 py-3 focus:top-2"
        >
          Skip to main content
        </a>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle bg-surface px-4 py-2 sm:px-6 lg:flex-nowrap lg:gap-x-6 lg:px-8">
          <div className="shrink-0 grow font-heading text-lg leading-heading font-bold lg:flex-none">
            Service Scheduler
          </div>
          <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
            <DealershipPicker />
          </div>
          {switcher ? (
            <RoleSwitcher switcher={switcher} />
          ) : (
            status === "signed-out" && (
              <span className="text-sm text-text-secondary">Not signed in</span>
            )
          )}
        </header>
        {showsNav && lg && <PrimaryNav role={role} bottom={false} />}
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className="mx-auto w-full max-w-(--size-content) flex-1 px-4 pt-4 pb-8 outline-hidden sm:px-6 lg:px-8 lg:pt-6"
        >
          <Outlet />
        </main>
        <footer className="px-4 py-4 text-sm text-text-secondary sm:px-6 lg:px-8">
          Demo with made-up data.
          {mockEnabled && (
            <>
              {" "}
              <Link to={devPanelPath}>Dev panel</Link>
            </>
          )}
        </footer>
        <div ref={setSlot} />
        {tabBar && <PrimaryNav role={role} bottom />}
      </div>
      <ToastViewport barShowing={barShowing} />
    </ShellContext>
  );
}
