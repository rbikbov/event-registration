import { describe, expect, it } from "vitest";

import { statusFilter } from "./status-filter";

describe("statusFilter", () => {
  it.each(["confirmed", "waitlisted", "cancelled"] as const)("keeps the status %s", (status) => {
    expect(statusFilter(status)).toBe(status);
  });

  it("is null without a status: every registration is shown", () => {
    expect(statusFilter(undefined)).toBeNull();
  });

  it("is null for an unknown status instead of a request the server rejects", () => {
    expect(statusFilter("gone")).toBeNull();
  });

  it("takes the first of repeated statuses, as vue-router gives an array", () => {
    expect(statusFilter(["waitlisted", "confirmed"])).toBe("waitlisted");
    expect(statusFilter([null])).toBeNull();
  });
});
