import { describe, expect, it } from "vitest";

import { formatMoment } from "./moment-format";

// Local times: the day is the calendar day where the browser is.
const now = new Date(2026, 10, 3, 0, 0);

const format = (at: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru", options).format(at);

describe("formatMoment", () => {
  it.each([
    ["today: the time alone, after «в»", new Date(2026, 10, 3, 23, 59), "23:59", true],
    [
      "ten minutes ago, yesterday: with the day",
      new Date(2026, 10, 2, 23, 50),
      "2 ноября в 23:50",
      false,
    ],
    [
      "another day this year: with the day",
      new Date(2026, 9, 31, 9, 15),
      "31 октября в 09:15",
      false,
    ],
    [
      "the same day of another year: with the year",
      new Date(2025, 10, 3, 0, 0),
      "3 ноября 2025 г. в 00:00",
      false,
    ],
  ])("%s", (_case, at, text, withAt) => {
    expect(formatMoment(at.toISOString(), now, format)).toEqual({ text, withAt });
  });
});
