import type { LocationQueryValue } from "vue-router";

import type { components } from "@/shared/api";

export type RegistrationStatus = components["schemas"]["RegistrationStatusEnum"];

export const registrationStatuses: readonly RegistrationStatus[] = [
  "confirmed",
  "waitlisted",
  "cancelled",
];

function isStatus(value: string): value is RegistrationStatus {
  return (registrationStatuses as readonly string[]).includes(value);
}

/** The status filter from `?status=` of the URL; null shows every registration. */
export function statusFilter(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): RegistrationStatus | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && isStatus(first) ? first : null;
}
