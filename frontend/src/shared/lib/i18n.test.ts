import { describe, expect, it } from "vitest";

import { createAppI18n, russianPlural } from "./i18n";

describe("russianPlural", () => {
  it.each([
    [1, 0],
    [21, 0],
    [101, 0],
    [2, 1],
    [4, 1],
    [22, 1],
    [0, 2],
    [5, 2],
    [11, 2],
    [12, 2],
    [14, 2],
    [111, 2],
    [112, 2],
    [30, 2],
  ] as const)("form of %i is %i", (count, form) => {
    expect(russianPlural(count)).toBe(form);
  });
});

describe("date formats", () => {
  // Local time: the format shows the moment where the browser is.
  const startsAt = new Date(2027, 4, 1, 18, 0);

  it.each([
    ["short", "1 мая 2027 г., 18:00"],
    ["long", "1 мая 2027 г. в 18:00"],
  ])("formats a date the %s way", (name, expected) => {
    expect(createAppI18n().global.d(startsAt, name)).toBe(expected);
  });
});
