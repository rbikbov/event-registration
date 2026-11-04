import { describe, expect, it } from "vitest";

import { countsChanged, pageCount, type RegistrationCounts } from "./participant-pages";

const counts: RegistrationCounts = { confirmed: 50, waitlisted: 30, cancelled: 21, checked_in: 3 };

describe("pageCount", () => {
  it("counts every registration without a status filter", () => {
    expect(pageCount(counts, null)).toBe(3);
  });

  it.each([
    ["confirmed", 1],
    ["waitlisted", 1],
    ["cancelled", 1],
  ] as const)("counts only the %s registrations for that filter", (status, pages) => {
    expect(pageCount(counts, status)).toBe(pages);
  });

  it("starts a page after every 50", () => {
    expect(pageCount({ ...counts, confirmed: 51 }, "confirmed")).toBe(2);
    expect(pageCount({ ...counts, confirmed: 100 }, "confirmed")).toBe(2);
  });

  it("has one page when there is nobody", () => {
    expect(pageCount({ confirmed: 0, waitlisted: 0, cancelled: 0, checked_in: 0 }, null)).toBe(1);
  });
});

describe("countsChanged", () => {
  it("is false for the same counts", () => {
    expect(countsChanged(counts, { ...counts })).toBe(false);
  });

  it.each(["confirmed", "waitlisted", "cancelled", "checked_in"] as const)(
    "is true when %s differs",
    (key) => {
      expect(countsChanged(counts, { ...counts, [key]: counts[key] + 1 })).toBe(true);
    },
  );
});
