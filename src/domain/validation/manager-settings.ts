// What counts as a good settings or shifts change from the manager (AD-4). Messages name the field
// and the rule. The refused values are the planner's minimum for a safe save (ticket guesses).
import { isLocalDate } from "../time";
import type { FieldError } from "./new-customer";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is string =>
  typeof value === "string" && TIME.test(value);
const minutesOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Collects errors under a field prefix. */
function collector() {
  const errors: FieldError[] = [];
  return {
    errors,
    add: (field: string, message: string) => errors.push({ field, message }),
  };
}
type Add = (field: string, message: string) => void;

function checkKeys(
  value: Record<string, unknown>,
  allowed: string[],
  prefix: string,
  add: Add,
) {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    const field = prefix + key;
    add(
      field,
      key === "timeZone"
        ? "The time zone cannot be changed."
        : "This field is not accepted.",
    );
  }
}

function checkHours(value: unknown, field: string, add: Add) {
  if (!isObject(value)) return add(field, "Opening hours are required.");
  if (!isTime(value.open)) add(`${field}.open`, "Opening time must be HH:mm.");
  if (!isTime(value.close)) {
    add(`${field}.close`, "Closing time must be HH:mm.");
  }
  if (
    isTime(value.open) &&
    isTime(value.close) &&
    minutesOf(value.open) >= minutesOf(value.close)
  ) {
    add(`${field}.close`, "Closing time must be after the opening time.");
  }
}

function checkWholeNumber(
  value: unknown,
  min: number,
  field: string,
  message: string,
  add: Add,
) {
  if (!Number.isInteger(value) || (value as number) < min) add(field, message);
}

/** Checks the body of `updateDealershipSettings`. */
export function validateDealershipSettings(input: unknown): FieldError[] {
  const { errors, add } = collector();
  if (!isObject(input))
    return [{ field: "body", message: "A body is required." }];
  checkKeys(input, ["weeklyHours", "dateOverrides", "policies"], "", add);

  if (!isObject(input.weeklyHours)) {
    add("weeklyHours", "Weekly hours are required.");
  } else {
    for (const [day, hours] of Object.entries(input.weeklyHours)) {
      const field = `weeklyHours.${day}`;
      if (!WEEKDAYS.includes(day)) add(field, "Weekday must be 1 to 7.");
      else checkHours(hours, field, add);
    }
  }
  if (!isObject(input.dateOverrides)) {
    add("dateOverrides", "Date overrides are required.");
  } else {
    for (const [date, hours] of Object.entries(input.dateOverrides)) {
      const field = `dateOverrides.${date}`;
      if (!isLocalDate(date)) add(field, "Date must be YYYY-MM-DD.");
      else if (hours !== "closed") checkHours(hours, field, add);
    }
  }
  if (!isObject(input.policies)) {
    add("policies", "Policies are required.");
  } else {
    const { policies } = input;
    checkKeys(
      policies,
      ["leadTimeMinutes", "horizonDays", "breakMinutes"],
      "policies.",
      add,
    );
    checkWholeNumber(
      policies.leadTimeMinutes,
      0,
      "policies.leadTimeMinutes",
      "Lead time must be 0 minutes or more.",
      add,
    );
    checkWholeNumber(
      policies.horizonDays,
      1,
      "policies.horizonDays",
      "Horizon must be 1 day or more.",
      add,
    );
    checkWholeNumber(
      policies.breakMinutes,
      0,
      "policies.breakMinutes",
      "Break must be 0 minutes or more.",
      add,
    );
  }
  return errors;
}

function checkShift(value: unknown, field: string, grid: number, add: Add) {
  if (!isObject(value)) return add(field, "A shift is required.");
  const onGrid = (time: unknown, name: string, label: string) => {
    if (!isTime(time)) {
      add(`${field}.${name}`, `${label} must be HH:mm.`);
      return false;
    }
    if (minutesOf(time) % grid !== 0) {
      add(`${field}.${name}`, `${label} must be on the ${grid}-minute grid.`);
    }
    return true;
  };
  const startOk = onGrid(value.start, "start", "Shift start");
  const endOk = onGrid(value.end, "end", "Shift end");
  const shiftOk =
    startOk &&
    endOk &&
    minutesOf(value.start as string) < minutesOf(value.end as string);
  if (startOk && endOk && !shiftOk) {
    add(`${field}.end`, "Shift end must be after the shift start.");
  }
  const { breakStart, breakEnd } = value;
  if (breakStart === undefined && breakEnd === undefined) return;
  if (breakStart === undefined || breakEnd === undefined) {
    return add(`${field}.breakEnd`, "A break needs a start and an end.");
  }
  const breakStartOk = onGrid(breakStart, "breakStart", "Break start");
  const breakEndOk = onGrid(breakEnd, "breakEnd", "Break end");
  if (!breakStartOk || !breakEndOk) return;
  if (minutesOf(breakStart as string) >= minutesOf(breakEnd as string)) {
    add(`${field}.breakEnd`, "Break end must be after the break start.");
  } else if (
    shiftOk &&
    (minutesOf(breakStart as string) < minutesOf(value.start as string) ||
      minutesOf(breakEnd as string) > minutesOf(value.end as string))
  ) {
    add(`${field}.breakStart`, "The break must be inside the shift.");
  }
}

/** Checks the body of `updateTechnicianShifts`; `grid` is the dealership's start-time grid. */
export function validateTechnicianShifts(
  input: unknown,
  grid: number,
): FieldError[] {
  const { errors, add } = collector();
  if (!isObject(input))
    return [{ field: "body", message: "A body is required." }];
  checkKeys(input, ["shiftPattern", "shiftExceptions"], "", add);

  if (!isObject(input.shiftPattern)) {
    add("shiftPattern", "The weekly pattern is required.");
  } else {
    for (const [day, shift] of Object.entries(input.shiftPattern)) {
      const field = `shiftPattern.${day}`;
      if (!WEEKDAYS.includes(day)) add(field, "Weekday must be 1 to 7.");
      else checkShift(shift, field, grid, add);
    }
  }
  if (!isObject(input.shiftExceptions)) {
    add("shiftExceptions", "Date exceptions are required.");
  } else {
    for (const [date, exception] of Object.entries(input.shiftExceptions)) {
      const field = `shiftExceptions.${date}`;
      if (!isLocalDate(date)) add(field, "Date must be YYYY-MM-DD.");
      else if (isObject(exception) && exception.kind === "changed") {
        checkShift(exception.shift, `${field}.shift`, grid, add);
      } else if (!isObject(exception) || exception.kind !== "leave") {
        add(field, "An exception is a leave or a changed shift.");
      }
    }
  }
  return errors;
}
