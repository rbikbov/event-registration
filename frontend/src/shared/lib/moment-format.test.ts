import { describe, expect, it } from "vitest";

import { momentFormat, sameDay } from "./moment-format";

// Local times: the day is the calendar day where the browser is.
const now = new Date(2026, 10, 3, 0, 0);

function format(at: Date): string {
  return new Intl.DateTimeFormat("ru", momentFormat(at, now)).format(at);
}

describe("momentFormat", () => {
  it.each([
    ["today: the time alone", new Date(2026, 10, 3, 0, 0), "00:00"],
    ["ten minutes ago, yesterday: with the day", new Date(2026, 10, 2, 23, 50), "2 ноября в 23:50"],
    ["another day this year: with the day", new Date(2026, 9, 31, 9, 15), "31 октября в 09:15"],
    [
      "the same day of another year: with the year",
      new Date(2025, 10, 3, 0, 0),
      "3 ноября 2025 г. в 00:00",
    ],
  ])("%s", (_case, at, expected) => {
    expect(format(at)).toBe(expected);
  });
});

describe("sameDay", () => {
  it("compares calendar days, not 24 hours", () => {
    expect(sameDay(new Date(2026, 10, 3, 23, 59), now)).toBe(true);
    expect(sameDay(new Date(2026, 10, 2, 23, 50), now)).toBe(false);
    expect(sameDay(new Date(2025, 10, 3, 0, 0), now)).toBe(false);
  });
});
