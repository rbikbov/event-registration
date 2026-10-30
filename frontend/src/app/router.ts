import type { QueryClient } from "@tanstack/vue-query";
import { createRouter, type RouterHistory } from "vue-router";

import { meQuery } from "@/entities/session";
import { EventPage } from "@/pages/event";
import { HealthPage } from "@/pages/health";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { OrgEventNewPage } from "@/pages/org-event-new";
import { OrgEventsPage } from "@/pages/org-events";
import { routes } from "@/shared/config";

export function createAppRouter(queryClient: QueryClient, history: RouterHistory) {
  const router = createRouter({
    history,
    routes: [
      { path: routes.home, component: HomePage },
      { path: routes.event, component: EventPage },
      { path: routes.health, component: HealthPage },
      { path: routes.login, component: LoginPage },
      { path: routes.orgEvents, component: OrgEventsPage, meta: { requiresAuth: true } },
      { path: routes.orgEventsNew, component: OrgEventNewPage, meta: { requiresAuth: true } },
    ],
  });

  router.beforeEach(async (to) => {
    // Public pages do not depend on the session; asking `me` there only logs a 401 for a guest.
    if (!to.meta.requiresAuth && to.path !== routes.login) return true;
    const user = await queryClient.ensureQueryData(meQuery);
    if (to.meta.requiresAuth && user === null) return routes.login;
    if (to.path === routes.login && user !== null) return routes.orgEvents;
    return true;
  });

  return router;
}
