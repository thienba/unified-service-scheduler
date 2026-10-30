// Who is looking (design.md 8.1, 8.2). The session holds the user the API says we are (`GET /me`), and in the
// demo the list of seeded users and the way to switch to another. Nothing here is the cache: after a switch the
// query cache is emptied before the next screen loads (SEC-13.AC-2).
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { ApiClient } from "../../api/client";
import { homeFor } from "../app/guard";
import { useToast } from "../components/Toast";
import { ApiProblem, call, type Me } from "../data/api-problem";
import { roleName } from "../data/words";
import type { DemoSupport, DemoUser } from "../demo/demo-session";

export interface SwitcherState {
  users: readonly DemoUser[];
  /** True when the list of users could not be read. */
  loadFailed: boolean;
  reloadUsers: () => void;
  userId: string | null;
  switching: boolean;
  pick: (userId: string) => Promise<void>;
}

export type SessionStatus = "loading" | "ready" | "signed-out" | "error";

export interface Session {
  status: SessionStatus;
  me: Me | null;
  problem: ApiProblem | null;
  reload: () => void;
  client: ApiClient;
  /** Only in the demo. It is null in a remote build: no role switcher is drawn. */
  switcher: SwitcherState | null;
  /** "Switch role" moves focus to the header control (or opens the sheet on a phone). */
  focusSwitcher: () => void;
  setFocusSwitcher: (focus: (() => void) | null) => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider above it.");
  return session;
}

export function SessionProvider({
  client,
  demo,
  children,
}: {
  client: ApiClient;
  demo: DemoSupport | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<{
    status: SessionStatus;
    me: Me | null;
    problem: ApiProblem | null;
  }>({ status: "loading", me: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const [users, setUsers] = useState<readonly DemoUser[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usersAttempt, setUsersAttempt] = useState(0);
  const [switching, setSwitching] = useState(false);
  const focus = useRef<(() => void) | null>(null);

  const loadMe = useCallback(() => call(client.GET("/me")), [client]);

  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, status: "loading" }));
    (demo
      ? // A failed user list does not block a valid stored user: the switcher reports that failure itself.
        demo
          .settle()
          .catch(() => undefined)
          .then(loadMe)
      : loadMe()
    ).then(
      (me) => current && setState({ status: "ready", me, problem: null }),
      (error: unknown) => {
        if (!current) return;
        const problem =
          error instanceof ApiProblem ? error : new ApiProblem(0, null, null);
        setState({
          status: problem.status === 401 ? "signed-out" : "error",
          me: null,
          problem,
        });
      },
    );
    return () => {
      current = false;
    };
  }, [demo, loadMe, attempt]);

  useEffect(() => {
    if (!demo) return;
    let current = true;
    setLoadFailed(false);
    demo.listUsers().then(
      (list) => current && setUsers(list),
      () => current && setLoadFailed(true),
    );
    return () => {
      current = false;
    };
  }, [demo, usersAttempt]);

  const pick = useCallback(
    async (id: string) => {
      if (!demo || switching) return;
      const previous = demo.userId();
      // The screens go first, then the cache is emptied, then the new user is read (SEC-13.AC-2).
      flushSync(() => setSwitching(true));
      queryClient.clear();
      demo.setUser(id);
      try {
        const me = await loadMe();
        setState({ status: "ready", me, problem: null });
        navigate(homeFor(me.role));
        toast.show({
          kind: "success",
          message: `Now viewing as ${roleName[me.role]}, ${me.name}`,
        });
      } catch {
        if (previous) demo.setUser(previous);
        toast.show({
          kind: "error",
          message: "We could not switch to that user. Nothing was changed.",
        });
      } finally {
        setSwitching(false);
      }
    },
    [demo, switching, queryClient, loadMe, navigate, toast],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const reloadUsers = useCallback(() => setUsersAttempt((n) => n + 1), []);
  const setFocusSwitcher = useCallback((fn: (() => void) | null) => {
    focus.current = fn;
  }, []);
  const focusSwitcher = useCallback(() => focus.current?.(), []);

  const value = useMemo<Session>(
    () => ({
      ...state,
      reload,
      client,
      switcher: demo
        ? {
            users,
            loadFailed,
            reloadUsers,
            userId: state.me?.userId ?? null,
            switching,
            pick,
          }
        : null,
      focusSwitcher,
      setFocusSwitcher,
    }),
    [
      state,
      reload,
      client,
      demo,
      users,
      loadFailed,
      reloadUsers,
      switching,
      pick,
      focusSwitcher,
      setFocusSwitcher,
    ],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}
