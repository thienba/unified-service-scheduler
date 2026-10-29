// The rules and words of the two manager forms (manager.md 5.3, 5.4), one rule per test.
import { describe, expect, it } from "vitest";
import type { components } from "../../../api/contract/schema";
import {
  hoursChangeSentence,
  hoursRows,
  newlyFlagged,
  savedWords,
  shiftsChangeSentence,
  type Appointment,
} from "./flag-impact";
import {
  addDateProblems,
  dateRowWords,
  sameSettings,
  settingsFromDealership,
  settingsProblems,
  settingsRequest,
  weekdayChange,
  type SettingsValues,
} from "./settings-form";
import {
  addDates,
  addEntryProblems,
  entryRowWords,
  shiftsFromTechnician,
  shiftsProblems,
  shiftsRequest,
  type ShiftsValues,
} from "./shifts-form";
import { countWord, nextQuarter, weekdayIndexOf } from "./words";

type Dealership = components["schemas"]["Dealership"];
type Technician = components["schemas"]["Technician"];

const TODAY = "2026-10-28"; // a Wednesday
const ZONE = "Europe/London";

const dealership: Dealership = {
  id: "d1",
  name: "Test Motors",
  timeZone: ZONE,
  weeklyHours: {
    "1": { open: "08:00", close: "18:00" },
    "2": { open: "08:00", close: "18:00" },
    "3": { open: "08:00", close: "18:00" },
    "4": { open: "08:00", close: "18:00" },
    "5": { open: "08:00", close: "18:00" },
    "6": { open: "08:00", close: "17:00" },
  },
  dateOverrides: {
    "2026-01-01": "closed",
    "2026-11-14": { open: "08:00", close: "19:00" },
  },
  policies: {
    leadTimeMinutes: 120,
    horizonDays: 30,
    breakMinutes: 15,
    gridMinutes: 15,
  },
} as Dealership;

const technician = {
  id: "t1",
  dealershipId: "d1",
  name: "Priya Nair",
  active: true,
  skills: ["mechanic"],
  shiftPattern: {
    "1": {
      start: "08:00",
      end: "16:30",
      breakStart: "12:00",
      breakEnd: "13:00",
    },
    "2": { start: "08:00", end: "16:30" },
  },
  shiftExceptions: {
    "2026-01-05": { kind: "leave" },
    "2026-11-03": {
      kind: "changed",
      shift: { start: "09:00", end: "13:00" },
    },
  },
} as unknown as Technician;

const settings = () => settingsFromDealership(dealership, TODAY);
const shifts = () => shiftsFromTechnician(technician, TODAY);

const appointment = (
  id: string,
  start: string,
  end: string,
  kind = "outside_opening_hours",
): Appointment =>
  ({
    id,
    start,
    end,
    technicianId: "t1",
    flags: [{ kind, reason: "no longer fits" }],
    display: { serviceTypeName: "Inspection", customerName: "Ana Costa" },
  }) as unknown as Appointment;

describe("words", () => {
  it("counts in words up to ten, the weekday of a date, the next quarter hour", () => {
    expect(countWord(2)).toBe("Two");
    expect(countWord(12)).toBe("12");
    expect(weekdayIndexOf("2026-10-31")).toBe(5);
    expect(nextQuarter("08:10")).toBe("08:15");
  });
});

describe("dealership settings", () => {
  it("fills one row per weekday, Sunday closed, hides past dates and turns minutes into hours", () => {
    const v = settings();
    expect(v.days).toHaveLength(7);
    expect(v.days[6]).toEqual({ off: true, open: "", close: "" });
    expect(v.dates.map((d) => d.date)).toEqual(["2026-11-14"]);
    expect(v.notice).toBe("2");
  });

  it("sends the whole settings back, with the past dates unchanged", () => {
    const body = settingsRequest(settings(), dealership, TODAY);
    expect(body.weeklyHours["7"]).toBeUndefined();
    expect(body.dateOverrides).toEqual(dealership.dateOverrides);
    expect(body.policies).toEqual({
      leadTimeMinutes: 120,
      horizonDays: 30,
      breakMinutes: 15,
    });
  });

  it("explains a closing time before the opening time in a sentence", () => {
    const v = settings();
    v.days[0] = { off: false, open: "08:00", close: "07:00" };
    expect(settingsProblems(v, TODAY)[0]).toMatchObject({
      path: "days.0.close",
      message:
        "Monday closes at 07:00, before it opens at 08:00. Choose a closing time after 08:00.",
    });
  });

  it("refuses a time off the quarter hour, notice above 72, horizon 0 and a break of 61", () => {
    const v: SettingsValues = {
      ...settings(),
      notice: "73",
      horizon: "0",
      breakMinutes: "61",
    };
    v.days[1] = { off: false, open: "08:10", close: "18:00" };
    expect(settingsProblems(v, TODAY).map((p) => p.path)).toEqual([
      "days.1.open",
      "notice",
      "horizon",
      "breakMinutes",
    ]);
  });

  it("refuses a date that already has an entry, and a date in the past", () => {
    const v = settings();
    v.add = { date: "2026-11-14", kind: "closed", open: "", close: "" };
    expect(addDateProblems(v, TODAY)[0]!.message).toBe(
      "There is already a change for Sat 14 Nov. Remove it first, then add it again.",
    );
    v.add = { ...v.add, date: "2026-10-01" };
    expect(addDateProblems(v, TODAY)[0]!.message).toBe(
      "Choose today or a later date.",
    );
  });

  it("describes a date as longer, shorter or closed against its weekday", () => {
    const v = settings();
    expect(dateRowWords(v.dates[0]!, v.days)).toEqual({
      badge: { label: "Longer", icon: "plus" },
      summary: "Open 08:00 to 19:00",
      comparison:
        "Longer than usual: closes 2 hours later (usual 08:00 to 17:00).",
    });
    expect(
      dateRowWords(
        {
          date: "2026-12-31",
          kind: "hours",
          open: "08:00",
          close: "14:00",
          isNew: true,
        },
        v.days,
      ).badge?.label,
    ).toBe("Shorter");
    expect(
      dateRowWords(
        {
          date: "2026-12-25",
          kind: "closed",
          open: "",
          close: "",
          isNew: true,
        },
        v.days,
      ),
    ).toMatchObject({
      badge: { label: "Closed" },
      comparison: "Replaces the usual 08:00 to 18:00.",
    });
  });

  it("counts a new date as a change, but not its New badge after saving", () => {
    const a = settings();
    const b = { ...a, dates: a.dates.map((d) => ({ ...d, isNew: true })) };
    expect(sameSettings(a, b)).toBe(true);
    expect(sameSettings(a, { ...a, notice: "3" })).toBe(false);
  });

  it("says the latest change in a short line", () => {
    const before = { off: false, open: "08:00", close: "17:00" };
    expect(
      weekdayChange("Saturday", before, { ...before, close: "14:00" }),
    ).toBe("Saturday now closes at 14:00");
    expect(
      weekdayChange("Monday", before, { off: true, open: "", close: "" }),
    ).toBe("Monday is now closed");
  });
});

describe("shifts", () => {
  it("fills the pattern and the future entries, and sends a break only when both times are there", () => {
    const v = shifts();
    expect(v.days[1]).toMatchObject({ start: "08:00", breakStart: "" });
    expect(v.entries.map((e) => e.date)).toEqual(["2026-11-03"]);
    const body = shiftsRequest(v, technician, TODAY);
    expect(body.shiftPattern["2"]).toEqual({ start: "08:00", end: "16:30" });
    expect(body.shiftExceptions["2026-01-05"]).toEqual({ kind: "leave" });
  });

  it("refuses half a break, a break outside the shift and an end before the start", () => {
    const v = shifts();
    v.days[0] = { ...v.days[0]!, breakEnd: "" };
    v.days[1] = { ...v.days[1]!, breakStart: "07:00", breakEnd: "07:30" };
    v.days[2] = {
      off: false,
      start: "08:00",
      end: "07:00",
      breakStart: "",
      breakEnd: "",
    };
    expect(shiftsProblems(v, TODAY).map((p) => p.message)).toEqual([
      "Monday has a break start but no break end. Add both break times, or leave both empty.",
      "Tuesday’s break starts at 07:00, before the shift starts at 08:00. Put the break inside the shift.",
      "Wednesday ends at 07:00, before it starts at 08:00. Choose an end time after 08:00.",
    ]);
  });

  it("refuses a last day before the first day; a range adds every day in it", () => {
    const v: ShiftsValues = {
      ...shifts(),
      add: { ...shifts().add, first: "2026-11-10", last: "2026-11-09" },
    };
    expect(addEntryProblems(v, TODAY)[0]!.message).toBe(
      "The last day is before the first day. Choose the same day or a later one.",
    );
    expect(
      addDates({ ...v.add, first: "2026-11-09", last: "2026-11-11" }),
    ).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("calls a shift on a day off an extra shift", () => {
    const v = shifts();
    expect(
      entryRowWords(
        {
          date: "2026-11-07",
          kind: "changed",
          start: "09:00",
          end: "13:00",
          breakStart: "",
          breakEnd: "",
          isNew: true,
        },
        v.days,
      ).badge.label,
    ).toBe("Extra shift");
  });
});

describe("the warning and the result", () => {
  it("counts only bookings the change flags newly, soonest first", () => {
    const a = appointment("a", "2026-10-31T15:00:00Z", "2026-10-31T16:00:00Z");
    const b = appointment("b", "2026-10-31T14:30:00Z", "2026-10-31T15:30:00Z");
    const c = appointment("c", "2026-10-30T14:30:00Z", "2026-10-30T15:30:00Z");
    expect(newlyFlagged([a, b, c], new Set(["c"])).map((x) => x.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("says which weekday changed and how many bookings end after the new closing time", () => {
    const before = settings();
    const after = settings();
    after.days[5] = { off: false, open: "08:00", close: "14:00" };
    const touched = [
      appointment("a", "2026-10-31T14:30:00Z", "2026-10-31T15:30:00Z"),
      appointment("b", "2026-10-31T15:00:00Z", "2026-10-31T16:00:00Z"),
    ];
    expect(hoursChangeSentence(before, after, touched, ZONE, TODAY)).toBe(
      "You changed Saturday: it now closes at 14:00 instead of 17:00. Two bookings on Sat 31 Oct end after that.",
    );
    expect(hoursRows(touched, after, ZONE)[0]).toEqual({
      key: "a",
      when: "Sat 31 Oct, 14:30 to 15:30",
      detail: "Inspection · Ana Costa · ends 1 hour 30 minutes after closing",
    });
  });

  it("says who was marked on leave and that the booking is with them that day", () => {
    const before = shifts();
    const after = shifts();
    after.entries = [
      ...after.entries,
      {
        date: "2026-11-02",
        kind: "leave",
        start: "",
        end: "",
        breakStart: "",
        breakEnd: "",
        isNew: true,
      },
    ];
    const touched = [
      appointment(
        "a",
        "2026-11-02T10:00:00Z",
        "2026-11-02T11:00:00Z",
        "outside_shift",
      ),
    ];
    expect(
      shiftsChangeSentence(before, after, touched, "Priya Nair", ZONE, TODAY),
    ).toBe(
      "You marked Priya Nair on leave on Mon 2 Nov. One booking is with Priya Nair that day.",
    );
  });

  it("words the result with and without flags", () => {
    expect(savedWords("settings", 0)).toMatchObject({
      title: "Settings saved",
      toast: "Dealership settings saved.",
    });
    expect(savedWords("settings", 2)).toMatchObject({
      title: "Saved. 2 bookings no longer fit.",
      toast: "Dealership settings saved. 2 bookings flagged.",
    });
    expect(savedWords("shifts", 1, "Priya Nair")).toMatchObject({
      title: "Saved. 1 booking no longer fits.",
      toast: "Shifts saved. 1 booking flagged.",
    });
  });
});
