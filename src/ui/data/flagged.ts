import { useQuery } from "@tanstack/react-query";
import { call } from "./api-problem";
import { useSession } from "../session/session";

/** How many appointments of the dealership are flagged: the number on the manager's Flagged tab. */
export function useFlaggedCount(dealershipId: string | undefined): number {
  const { client, me } = useSession();
  const enabled = me?.role === "manager" && dealershipId !== undefined;
  const flagged = useQuery({
    queryKey: ["flagged-count", dealershipId],
    queryFn: () =>
      call(
        client.GET("/appointments", {
          params: { query: { dealershipId: dealershipId!, flagged: true } },
        }),
      ),
    enabled,
  });
  return flagged.data?.length ?? 0;
}
