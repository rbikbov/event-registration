import type { LocationQueryValue } from "vue-router";

import type { paths } from "@/shared/api";

/** Which events a list shows: those to come or those already started. */
export type EventPeriod = NonNullable<
  NonNullable<paths["/api/events/"]["get"]["parameters"]["query"]>["period"]
>;

/** The period from `?period=` of the URL; anything but "past" is upcoming, the default. */
export function periodFromQuery(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): EventPeriod {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "past" ? "past" : "upcoming";
}
