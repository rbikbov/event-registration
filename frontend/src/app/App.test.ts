import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";

import { checkinPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import App from "./App.vue";
import { createAppRouter } from "./router";

async function mountApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory());
  await router.push(path);
  mount(App, { global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] } });
  return router;
}

describe("tab title", () => {
  it("names the page and the app, and follows the navigation", async () => {
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json({ id: 1, email: "demo@example.com" })),
      http.get("*/api/events/", () => HttpResponse.json([])),
      http.get("*/api/org/events/7/", () => HttpResponse.json({}, { status: 404 })),
    );
    const router = await mountApp(routes.home);
    expect(document.title).toBe("События — Регистрация на мероприятия");

    // A tab of the event layout: the layout's route has no title of its own.
    await router.push(checkinPath(7));

    await vi.waitFor(() => expect(document.title).toBe("Чекин — Регистрация на мероприятия"));
  });

  it("says 'page not found' on an address no route matches", async () => {
    await mountApp("/no-such-page");

    expect(document.title).toBe("Страница не найдена — Регистрация на мероприятия");
  });
});
