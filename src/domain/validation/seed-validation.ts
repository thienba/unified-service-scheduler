import type { Dealership, EpochMs, LocalTime, SeedData, Shift } from "../model";
import { zoneHasDst } from "../time";

function minutesOf(time: LocalTime): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const hoursKey = (d: Dealership) =>
  JSON.stringify(Object.entries(d.weeklyHours).sort());

/**
 * Checks the seed (AD-17, D-0001-3). Returns one sentence per problem, each naming the broken
 * reference or time; an empty list means the seed is good. `now` only picks the year for the DST check.
 */
export function validateSeed(seed: SeedData, now: EpochMs): string[] {
  const problems: string[] = [];
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const dealershipIds = ids(seed.dealerships);
  const technicianIds = ids(seed.technicians);
  const bayIds = ids(seed.serviceBays);
  const carIds = ids(seed.courtesyCars);
  const serviceTypeIds = ids(seed.serviceTypes);
  const customerIds = ids(seed.customers);
  const vehicleIds = ids(seed.vehicles);

  const reference = (
    owner: string,
    field: string,
    value: string,
    known: Set<string>,
  ) => {
    if (!known.has(value)) {
      problems.push(
        `${owner} points to ${field} "${value}", which does not exist`,
      );
    }
  };

  const gridOf = new Map(
    seed.dealerships.map((d) => [d.id, d.policies.gridMinutes]),
  );
  const onGrid = (
    owner: string,
    what: string,
    time: LocalTime,
    grid: number,
  ) => {
    if (minutesOf(time) % grid !== 0) {
      problems.push(
        `${owner}: ${what} ${time} is not on the ${grid}-minute grid`,
      );
    }
  };
  const checkShift = (owner: string, shift: Shift, grid: number) => {
    onGrid(owner, "shift start", shift.start, grid);
    onGrid(owner, "shift end", shift.end, grid);
    if (shift.breakStart !== undefined) {
      onGrid(owner, "break start", shift.breakStart, grid);
    }
    if (shift.breakEnd !== undefined) {
      onGrid(owner, "break end", shift.breakEnd, grid);
    }
  };

  for (const d of seed.dealerships) {
    const owner = `dealership "${d.id}"`;
    const grid = d.policies.gridMinutes;
    const hours = [
      ...Object.values(d.weeklyHours),
      ...Object.values(d.dateOverrides).filter((o) => o !== "closed"),
    ];
    for (const h of hours) {
      onGrid(owner, "opening time", h.open, grid);
      onGrid(owner, "closing time", h.close, grid);
    }
  }
  for (const t of seed.technicians) {
    const owner = `technician "${t.id}"`;
    reference(owner, "dealership", t.dealershipId, dealershipIds);
    const grid = gridOf.get(t.dealershipId) ?? 15;
    const shifts = [
      ...Object.values(t.shiftPattern),
      ...Object.values(t.shiftExceptions).flatMap((e) =>
        e.kind === "changed" ? [e.shift] : [],
      ),
    ];
    for (const shift of shifts) checkShift(owner, shift, grid);
  }
  for (const b of seed.serviceBays) {
    reference(`bay "${b.id}"`, "dealership", b.dealershipId, dealershipIds);
  }
  for (const c of seed.courtesyCars) {
    reference(
      `courtesy car "${c.id}"`,
      "dealership",
      c.dealershipId,
      dealershipIds,
    );
  }
  for (const v of seed.vehicles) {
    reference(`vehicle "${v.id}"`, "customer", v.customerId, customerIds);
  }
  for (const u of seed.demoUsers) {
    const owner = `demo user "${u.id}"`;
    if (u.customerId !== null) {
      reference(owner, "customer", u.customerId, customerIds);
    }
    for (const id of u.dealershipIds) {
      reference(owner, "dealership", id, dealershipIds);
    }
  }
  for (const a of seed.appointments) {
    const owner = `appointment "${a.id}"`;
    reference(owner, "dealership", a.dealershipId, dealershipIds);
    reference(owner, "customer", a.customerId, customerIds);
    reference(owner, "vehicle", a.vehicleId, vehicleIds);
    reference(owner, "service type", a.serviceTypeId, serviceTypeIds);
    reference(owner, "technician", a.technicianId, technicianIds);
    reference(owner, "bay", a.serviceBayId, bayIds);
    if (a.courtesyCarId !== null) {
      reference(owner, "courtesy car", a.courtesyCarId, carIds);
    }
  }

  if (new Set(seed.dealerships.map(hoursKey)).size < 2) {
    problems.push(
      "the seed needs at least two dealerships with different weekly hours",
    );
  }
  if (!seed.dealerships.some((d) => zoneHasDst(d.timeZone, now))) {
    problems.push(
      "the seed needs at least one dealership in a zone that has DST",
    );
  }
  return problems;
}
