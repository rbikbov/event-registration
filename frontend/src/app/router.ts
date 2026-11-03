import type { QueryClient } from "@tanstack/vue-query";
import { createRouter, type RouterHistory } from "vue-router";

import { meQuery } from "@/entities/session";
import { EventPage } from "@/pages/event";
import { HealthPage } from "@/pages/health";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { OrgCheckinPage } from "@/pages/org-checkin";
import { OrgEventLayout } from "@/pages/org-event";
import { OrgEventEditPage } from "@/pages/org-event-edit";
import { OrgEventNewPage } from "@/pages/org-event-new";
import { OrgEventParticipantsPage } from "@/pages/org-event-participants";
import { OrgEventsPage } from "@/pages/org-events";
import { TicketPage } from "@/pages/ticket";
import { routes } from "@/shared/config";
import { safeNext } from "@/shared/lib/safe-next";

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
      {
        path: routes.orgEvent,
        component: OrgEventLayout,
        meta: { requiresAuth: true },
        // Absolute child paths: every path lives in `routes`. The layout keeps the event and its
        // stream while the organizer switches between the tabs.
        children: [
          { path: routes.orgEvent, component: OrgEventParticipantsPage },
          { path: routes.orgCheckin, component: OrgCheckinPage },
          { path: routes.orgEventEdit, component: OrgEventEditPage },
        ],
      },
      { path: routes.ticket, component: TicketPage },
    ],
  });

  router.beforeEach(async (to) => {
    // Public pages are not gated: who is signed in is the header's to show, not the guard's.
    if (!to.meta.requiresAuth && to.path !== routes.login) return true;
    const user = await queryClient.ensureQueryData(meQuery);
    // The only place that decides where a guest may go: a 401 elsewhere only forgets the user
    // and runs the navigation again (session-expiry.ts).
    if (to.meta.requiresAuth && user === null) {
      return { path: routes.login, query: { next: to.fullPath } };
    }
    if (to.path === routes.login && user !== null) return signedInTarget(to.query.next);
    return true;
  });

  return router;
}

// After sign-in: back to the page the guard sent the user from, if it is a page of this app.
// `next=/login` would only bounce once more through the guard: straight to the organizer page.
function signedInTarget(next: unknown): string {
  const path = safeNext(next);
  return path === null || path.startsWith(routes.login) ? routes.orgEvents : path;
}
