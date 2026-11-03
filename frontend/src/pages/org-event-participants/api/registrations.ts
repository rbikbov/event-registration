import { queryOptions } from "@tanstack/vue-query";

import { orgQueryKey } from "@/entities/event";
import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

import type { RegistrationCounts } from "../model/participant-pages";
import type { RegistrationStatus } from "../model/status-filter";

export type OrgRegistration = components["schemas"]["OrgRegistration"];

/**
 * A page of participants with the counts of the event at the start of its read. The counts are
 * taken before the request: a change during the read then arrives in a later snapshot and differs
 * from them, rather than being taken for already shown.
 */
export function orgRegistrationsQuery(
  eventId: number,
  status: RegistrationStatus | null,
  page: number,
  currentCounts: () => RegistrationCounts,
) {
  return queryOptions({
    queryKey: [...orgQueryKey, "events", eventId, "registrations", status, page],
    queryFn: async () => {
      const counts = currentCounts();
      const rows = await unwrap(
        api.GET("/api/org/events/{event_id}/registrations/", {
          params: { path: { event_id: eventId }, query: { ...(status ? { status } : {}), page } },
        }),
      );
      return { rows, counts };
    },
  });
}
