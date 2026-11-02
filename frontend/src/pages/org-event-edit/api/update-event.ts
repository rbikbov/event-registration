import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export function updateEvent(id: number, body: components["schemas"]["PatchedEventUpdateRequest"]) {
  return unwrap(
    api.PATCH("/api/org/events/{event_id}/", { params: { path: { event_id: id } }, body }),
  );
}
