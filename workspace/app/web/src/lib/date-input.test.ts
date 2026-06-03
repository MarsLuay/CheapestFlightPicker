import { describe, expect, it } from "vitest";

import {
  addDaysToLocalDate,
  clampDateInputToMinimum,
  differenceInCalendarDays,
  formatDateForInput,
  getLaterDateInput,
  shiftDateInput
} from "./date-input";

describe("date input helpers", () => {
  it("formats the local calendar date without converting through UTC", () => {
    const date = new Date(2026, 0, 5, 23, 45, 12);

    expect(formatDateForInput(date)).toBe("2026-01-05");
  });

  it("adds whole local calendar days for default date ranges", () => {
    const date = new Date(2026, 2, 8, 23, 30, 0);
    const shiftedDate = addDaysToLocalDate(date, 14);

    expect(formatDateForInput(shiftedDate)).toBe("2026-03-22");
  });

  it("shifts date input strings by whole calendar days", () => {
    expect(shiftDateInput("2026-05-08", 7)).toBe("2026-05-15");
    expect(shiftDateInput("2026-05-08", -3)).toBe("2026-05-05");
  });

  it("measures the difference between calendar-date input strings", () => {
    expect(differenceInCalendarDays("2026-05-08", "2026-05-15")).toBe(7);
    expect(differenceInCalendarDays("2026-05-15", "2026-05-08")).toBe(-7);
  });

  it("clamps date input strings to a minimum selectable date", () => {
    expect(clampDateInputToMinimum("2026-05-09", "2026-05-10")).toBe(
      "2026-05-10"
    );
    expect(clampDateInputToMinimum("2026-05-10", "2026-05-10")).toBe(
      "2026-05-10"
    );
    expect(clampDateInputToMinimum("2026-05-11", "2026-05-10")).toBe(
      "2026-05-11"
    );
  });

  it("returns the later defined date input string", () => {
    expect(getLaterDateInput("2026-05-09", "2026-05-10")).toBe("2026-05-10");
    expect(getLaterDateInput("2026-05-11", "2026-05-10")).toBe("2026-05-11");
    expect(getLaterDateInput(undefined, "2026-05-10")).toBe("2026-05-10");
    expect(getLaterDateInput("2026-05-10", undefined)).toBe("2026-05-10");
  });
});
