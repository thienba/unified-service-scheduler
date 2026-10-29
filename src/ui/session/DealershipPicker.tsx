// design.md 8.3. Staff and the manager: a Select (8.28) when they have two dealerships, plain text when one.
// A customer's header shows only the name, once they have chosen it in the booking form.
import { Button } from "../components/Button";
import { Select } from "../components/Select";
import { Skeleton } from "../components/StateBlock";
import { useSession } from "./session";
import { useSelectedDealership } from "./dealership";

export function DealershipPicker() {
  const { me } = useSession();
  const dealership = useSelectedDealership();
  if (me === null) return null;
  if (dealership.failed) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        Could not load dealerships. Try again.
        <Button variant="quiet" icon="refresh" onClick={dealership.retry}>
          Try again
        </Button>
      </p>
    );
  }
  if (dealership.loading)
    return (
      <Skeleton className="h-(--size-target) w-full max-w-(--size-side)" />
    );
  const { selected, options } = dealership;
  if (!selected) return null;
  if (me.role !== "customer" && options.length > 1) {
    return (
      <div className="w-full max-w-(--size-side)">
        <Select
          label="Dealership"
          hideLabel
          value={selected.id}
          options={options.map((d) => ({ value: d.id, label: d.name }))}
          onChange={dealership.select}
        />
      </div>
    );
  }
  return (
    <p
      className="flex min-h-(--size-target) items-center text-sm text-text-secondary"
      title={selected.name}
    >
      {selected.name}
    </p>
  );
}
