import { describe, expect, it } from "vitest";

import { russianPlural } from "./i18n";

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
