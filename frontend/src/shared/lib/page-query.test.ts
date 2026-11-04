import { describe, expect, it } from "vitest";

import { pageFromQuery } from "./page-query";

describe("pageFromQuery", () => {
  it.each([
    ["2", 2],
    [["3", "4"], 3],
    ["1000000", 1_000_000],
  ])("reads %j as page %i", (value, page) => {
    expect(pageFromQuery(value)).toBe(page);
  });

  it.each([undefined, null, "", "0", "-1", "1.5", "2x", "1000001", "abc"])(
    "falls back to page 1 for %j",
    (value) => {
      expect(pageFromQuery(value)).toBe(1);
    },
  );
});
