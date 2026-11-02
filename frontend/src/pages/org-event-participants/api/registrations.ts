import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

import type { RegistrationStatus } from "../model/status-filter";

export type OrgRegistration = components["schemas"]["OrgRegistration"];

export function orgRegistrationsQuery(eventId: number, status: RegistrationStatus | null) {
  return queryOptions({
    queryKey: ["org", "events", eventId, "registrations", status],
    queryFn: () =>
      unwrap(
        api.GET("/api/org/events/{event_id}/registrations/", {
          params: { path: { event_id: eventId }, query: status ? { status } : {} },
        }),
      ),
  });
}
