import type { LocationQueryValue } from "vue-router";

// The bound of `page` in the backend (the list query serializers of events and registrations).
const LAST_PAGE = 1_000_000;

/** The page from `?page=` of the URL; anything but a whole number in range is page 1. */
export function pageFromQuery(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || !/^\d+$/.test(first)) return 1;
  const page = Number(first);
  return page >= 1 && page <= LAST_PAGE ? page : 1;
}
