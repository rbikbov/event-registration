import { api, unwrap } from "@/shared/api";

export function checkIn(eventId: number, code: string) {
  return unwrap(
    api.POST("/api/org/events/{event_id}/checkin/", {
      params: { path: { event_id: eventId } },
      body: { code },
    }),
  );
}
