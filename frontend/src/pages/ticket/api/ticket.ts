import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";

export function ticketQuery(token: string) {
  return queryOptions({
    queryKey: ["tickets", token],
    queryFn: () =>
      unwrap(
        api.GET("/api/tickets/{manage_token}/", { params: { path: { manage_token: token } } }),
      ),
  });
}

export function cancelTicket(token: string) {
  return unwrap(
    api.POST("/api/tickets/{manage_token}/cancel/", { params: { path: { manage_token: token } } }),
  );
}
