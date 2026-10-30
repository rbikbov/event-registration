import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";

export const orgEventsQuery = queryOptions({
  queryKey: ["org", "events"],
  queryFn: () => unwrap(api.GET("/api/org/events/")),
});
