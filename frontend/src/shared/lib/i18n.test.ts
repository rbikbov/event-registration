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
    ["short", "1 May 2027, 18:00"],
    ["long", "1 May 2027 at 18:00"],
  ])("formats a date the %s way in English by default", (name, expected) => {
    expect(createAppI18n().global.d(startsAt, name)).toBe(expected);
  });

  it.each([
    ["short", "1 мая 2027 г., 18:00"],
    ["long", "1 мая 2027 г. в 18:00"],
  ])("formats a date the %s way in Russian", (name, expected) => {
    expect(createAppI18n("ru").global.d(startsAt, name)).toBe(expected);
  });
});

describe("messages", () => {
  const messages = {
    en: { seats: "{count} seat | {count} seats", only: "English" },
    ru: {
      seats: "{count} место | {count} места | {count} мест",
      only: "Русский",
      ruOnly: "Только",
    },
  };

  it("shows English with the English plural forms", () => {
    const { global } = createAppI18n();
    global.setLocaleMessage("en", messages.en);
    global.setLocaleMessage("ru", messages.ru);
    expect(global.t("only")).toBe("English");
    expect([1, 2, 5].map((n) => global.t("seats", n))).toEqual(["1 seat", "2 seats", "5 seats"]);
  });

  it("falls back to Russian for a text without an English version", () => {
    const { global } = createAppI18n();
    global.setLocaleMessage("en", messages.en);
    global.setLocaleMessage("ru", messages.ru);
    expect(global.t("ruOnly")).toBe("Только");
  });
});
