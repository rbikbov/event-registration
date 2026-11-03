import type { QueryClient } from "@tanstack/vue-query";
import { createRouter, type RouterHistory } from "vue-router";

import { meQuery } from "@/entities/session";
import { EventPage } from "@/pages/event";
import { HealthPage } from "@/pages/health";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { OrgCheckinPage } from "@/pages/org-checkin";
import { OrgEventLayout } from "@/pages/org-event";
import { OrgEventEditPage } from "@/pages/org-event-edit";
import { OrgEventNewPage } from "@/pages/org-event-new";
import { OrgEventParticipantsPage } from "@/pages/org-event-participants";
import { OrgEventsPage } from "@/pages/org-events";
import { TicketPage } from "@/pages/ticket";
import { routes } from "@/shared/config";
import { safeNext } from "@/shared/lib/safe-next";

// The tab title of a page: a key of the titles in App.vue, where the texts of the app live.
export type PageTitle =
  | "home"
  | "event"
  | "health"
  | "login"
  | "orgEvents"
  | "orgEventsNew"
  | "participants"
  | "checkin"
  | "edit"
  | "ticket"
  | "notFound";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    title?: PageTitle;
  }
}

export function createAppRouter(queryClient: QueryClient, history: RouterHistory) {
  const router = createRouter({
    history,
    routes: [
      { path: routes.home, component: HomePage, meta: { title: "home" } },
      { path: routes.event, component: EventPage, meta: { title: "event" } },
      { path: routes.health, component: HealthPage, meta: { title: "health" } },
      { path: routes.login, component: LoginPage, meta: { title: "login" } },
      {
        path: routes.orgEvents,
        component: OrgEventsPage,
        meta: { requiresAuth: true, title: "orgEvents" },
      },
      {
        path: routes.orgEventsNew,
        component: OrgEventNewPage,
        meta: { requiresAuth: true, title: "orgEventsNew" },
      },
      {
        path: routes.orgEvent,
        component: OrgEventLayout,
        meta: { requiresAuth: true },
        // Absolute child paths: every path lives in `routes`. The layout keeps the event and its
        // stream while the organizer switches between the tabs.
        children: [
          {
            path: routes.orgEvent,
            component: OrgEventParticipantsPage,
            meta: { title: "participants" },
          },
          { path: routes.orgCheckin, component: OrgCheckinPage, meta: { title: "checkin" } },
          { path: routes.orgEventEdit, component: OrgEventEditPage, meta: { title: "edit" } },
        ],
      },
      { path: routes.ticket, component: TicketPage, meta: { title: "ticket" } },
      { path: routes.notFound, component: NotFoundPage, meta: { title: "notFound" } },
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
