import type { QueryClient } from "@tanstack/vue-query";
import { createRouter, type RouterHistory } from "vue-router";

import { meQuery } from "@/entities/session";
import { HealthPage } from "@/pages/health";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { OrgEventsPage } from "@/pages/org-events";

export function createAppRouter(queryClient: QueryClient, history: RouterHistory) {
  const router = createRouter({
    history,
    routes: [
      { path: "/", component: HomePage },
      { path: "/health", component: HealthPage },
      { path: "/login", component: LoginPage },
      { path: "/org/events", component: OrgEventsPage, meta: { requiresAuth: true } },
    ],
  });

  router.beforeEach(async (to) => {
    const user = await queryClient.ensureQueryData(meQuery);
    if (to.meta.requiresAuth && user === null) return "/login";
    if (to.path === "/login" && user !== null) return "/org/events";
    return true;
  });

  return router;
}
