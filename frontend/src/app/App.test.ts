import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount, type VueWrapper } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type RouteRecordNormalized } from "vue-router";

import { checkinPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import App from "./App.vue";
import { createAppRouter } from "./router";

const APP = "Регистрация на мероприятия";

let mounted: VueWrapper | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

// The header asks `me` on every screen: it is answered here so no request is left in flight.
function signedIn(): void {
  server.use(
    http.get("*/api/auth/me/", () => HttpResponse.json({ id: 1, email: "demo@example.com" })),
  );
}

async function mountApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory());
  await router.push(path);
  mounted = mount(App, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { router, queryClient };
}

// Every route of the app that gives a title.
function titledRoutes(): RouteRecordNormalized[] {
  const router = createAppRouter(new QueryClient(), createMemoryHistory());
  return router.getRoutes().filter((route) => route.meta.title !== undefined);
}

describe("tab title", () => {
  it("names the page and the app, and follows the navigation", async () => {
    signedIn();
    server.use(
      http.get("*/api/events/", () => HttpResponse.json({ count: 0, results: [] })),
      http.get("*/api/org/events/7/", () => HttpResponse.json({}, { status: 404 })),
    );
    const { router, queryClient } = await mountApp(routes.home);
    expect(document.title).toBe(`События — ${APP}`);

    // A tab of the event layout: the layout's route has no title of its own.
    await router.push(checkinPath(7));

    await vi.waitFor(() => expect(document.title).toBe(`Чекин — ${APP}`));
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it("says 'page not found' on an address no route matches", async () => {
    signedIn();
    const { queryClient } = await mountApp("/no-such-page");

    expect(document.title).toBe(`Страница не найдена — ${APP}`);
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  // The titles are keys of the texts in App.vue: a key without a text would show as the key.
  // Each one is put on a route of its own, so no page has to load for it.
  it.each(titledRoutes().map((route) => [route.meta.title]))(
    "has a text for the title %s",
    async (title) => {
      signedIn();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: routes.home, component: { render: () => null }, meta: { title } }],
      });
      await router.push(routes.home);
      mounted = mount(App, {
        global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
      });

      expect(document.title).toMatch(new RegExp(` — ${APP}$`));
      expect(document.title).not.toMatch(/^titles\./);
      await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    },
  );
});
