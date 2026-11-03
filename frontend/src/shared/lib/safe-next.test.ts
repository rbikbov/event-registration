import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    ["/org/events/1", "/org/events/1"],
    ["/org/events/1?status=waitlisted&page=2", "/org/events/1?status=waitlisted&page=2"],
    ["/org/events/1/checkin#code", "/org/events/1/checkin#code"],
  ])("keeps the in-app path %s", (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });

  it.each([
    ["another site", "//evil.example"],
    ["a backslash the browser reads as a slash", "/\\evil.example"],
    ["a tab the browser drops", "/\t/evil.example"],
    ["a full URL", "https://evil.example/org/events"],
    ["a script URL", "javascript:alert(1)"],
    ["a relative path", "org/events"],
    ["an empty value", ""],
  ])("refuses %s", (_, value) => {
    expect(safeNext(value)).toBeNull();
  });

  it.each([
    ["no value", undefined],
    ["a repeated parameter", ["/org/events", "/"]],
    ["a parameter without a value", null],
  ])("refuses %s", (_, value) => {
    expect(safeNext(value)).toBeNull();
  });
});
