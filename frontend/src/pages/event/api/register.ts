import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export function registerForEvent(
  eventId: number,
  body: components["schemas"]["RegisterRequestRequest"],
) {
  return unwrap(
    api.POST("/api/events/{event_id}/registrations/", {
      params: { path: { event_id: eventId } },
      body,
    }),
  );
}
