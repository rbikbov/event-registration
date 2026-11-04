import { describe, expect, it } from "vitest";

import type { LocationQueryValue } from "vue-router";

import { periodFromQuery, type EventPeriod } from "./event-period";

describe("periodFromQuery", () => {
  it.each<[LocationQueryValue | LocationQueryValue[] | undefined, EventPeriod]>([
    ["past", "past"],
    [["past", "upcoming"], "past"],
    ["upcoming", "upcoming"],
    [undefined, "upcoming"],
    [null, "upcoming"],
    ["", "upcoming"],
    ["PAST", "upcoming"],
    ["soon", "upcoming"],
  ])("reads %j as %s", (value, period) => {
    expect(periodFromQuery(value)).toBe(period);
  });
});
