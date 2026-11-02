import type { LocationQueryValue } from "vue-router";

import type { OrgEvent } from "@/entities/event";

import type { RegistrationStatus } from "./status-filter";

// PAGE_SIZE and the bound of `page` in backend/registrations (services.py, serializers.py).
const PAGE_SIZE = 50;
const LAST_PAGE = 1_000_000;

/** The counts of the event that tell what a page of participants shows. */
export type RegistrationCounts = Pick<
  OrgEvent,
  "confirmed" | "waitlisted" | "cancelled" | "checked_in"
>;

/** The page from `?page=` of the URL; anything but a whole number in range is page 1. */
export function pageFromQuery(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || !/^\d+$/.test(first)) return 1;
  const page = Number(first);
  return page >= 1 && page <= LAST_PAGE ? page : 1;
}

/** How many pages the filter has, at least one: the list does not count itself. */
export function pageCount(counts: RegistrationCounts, status: RegistrationStatus | null): number {
  const total = status ? counts[status] : counts.confirmed + counts.waitlisted + counts.cancelled;
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Whether a page read at `before` may differ from one read at `now`: a status or a check-in. */
export function countsChanged(before: RegistrationCounts, now: RegistrationCounts): boolean {
  return (
    before.confirmed !== now.confirmed ||
    before.waitlisted !== now.waitlisted ||
    before.cancelled !== now.cancelled ||
    before.checked_in !== now.checked_in
  );
}
