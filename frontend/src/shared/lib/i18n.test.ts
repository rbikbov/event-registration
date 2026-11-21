import { describe, expect, it } from "vitest";

import { createAppI18n } from "./i18n";

describe("date formats", () => {
  // Local time: the format shows the moment where the browser is.
  const startsAt = new Date(2027, 4, 1, 18, 0);

  it.each([
    ["short", "1 May 2027, 18:00"],
    ["long", "1 May 2027 at 18:00"],
  ])("formats a date the %s way", (name, expected) => {
    expect(createAppI18n().global.d(startsAt, name)).toBe(expected);
  });
});

describe("messages", () => {
  it("takes the `en` messages and their plural forms", () => {
    const { global } = createAppI18n();
    global.setLocaleMessage("en", { seats: "{count} seat | {count} seats" });
    expect([1, 2, 5].map((n) => global.t("seats", n))).toEqual(["1 seat", "2 seats", "5 seats"]);
  });
});
