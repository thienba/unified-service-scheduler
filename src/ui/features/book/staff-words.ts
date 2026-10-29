// Addresses of the staff booking flow. Only ids and a time travel in them (SEC-10.AC-5): `start` and
// `technicianId` from a tapped gap, `dealership`, the chosen `service`, and the picked `customerId` and
// `vehicleId`. The service is kept so "Change customer" and "Edit details" do not lose it.
const kept = ["dealership", "service", "start", "technicianId"] as const;

function carry(params: URLSearchParams, extra: Record<string, string>) {
  const next = new URLSearchParams();
  for (const name of kept) {
    const value = params.get(name);
    if (value !== null) next.set(name, value);
  }
  for (const [name, value] of Object.entries(extra)) next.set(name, value);
  const text = next.toString();
  return text ? `?${text}` : "";
}

/** The staff `book` page for the chosen customer (none for a new customer, who is in screen memory). */
export function addressFor(
  params: URLSearchParams,
  ids: { customerId?: string; vehicleId?: string },
): string {
  return `/book${carry(params, ids)}`;
}

/** Back to `book-customer`, with the gap kept. */
export function searchAddress(params: URLSearchParams): string {
  return `/book/for-customer${carry(params, {})}`;
}
