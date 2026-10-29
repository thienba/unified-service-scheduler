// The dealership a screen is about, kept in `?dealership=` (design.md 8.3). The value in the address is
// untrusted (SEC-12): it is looked up in what the API returned and never shown or followed as it was typed.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { call, type Dealership } from "../data/api-problem";
import { viewerTimeZone, zoneNote } from "../format/format";
import { useSession } from "./session";

export function useDealerships() {
  const { client, status, me } = useSession();
  return useQuery({
    queryKey: ["dealerships", me?.userId],
    queryFn: () => call(client.GET("/dealerships")),
    enabled: status === "ready",
  });
}

export interface SelectedDealership {
  loading: boolean;
  failed: boolean;
  retry: () => void;
  /** The dealerships this person may pick between: their own for staff and the manager. */
  options: readonly Dealership[];
  /** The one in use. For a customer it is only set once chosen (in the booking form). */
  selected: Dealership | undefined;
  /** The address names a real dealership that is not the person's own. */
  foreign: Dealership | undefined;
  select: (id: string) => void;
}

export function useSelectedDealership(): SelectedDealership {
  const { me } = useSession();
  const dealerships = useDealerships();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const all = dealerships.data ?? [];
  const garage = me !== null && me.role !== "customer";
  const options = garage
    ? all.filter((d) => me.dealershipIds.includes(d.id))
    : all;
  const asked = params.get("dealership");
  const named = all.find((d) => d.id === asked);
  const selected = garage
    ? (options.find((d) => d.id === asked) ?? options[0])
    : named;
  const foreign =
    garage && named && !options.includes(named) ? named : undefined;
  return {
    loading: dealerships.isPending && dealerships.fetchStatus !== "idle",
    failed: dealerships.isError,
    retry: () => void dealerships.refetch(),
    options,
    selected,
    foreign,
    select: (id) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("dealership", id);
        return next;
      });
      // The screens read the new dealership and load again.
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "dealerships",
      });
    },
  };
}

/** "Times are in London time." when the viewer's zone differs from the dealership's, for the schedule's title. */
export function useTimesNote(): string | null {
  const { selected } = useSelectedDealership();
  return selected
    ? zoneNote(selected.timeZone, viewerTimeZone(), "sentence")
    : null;
}
