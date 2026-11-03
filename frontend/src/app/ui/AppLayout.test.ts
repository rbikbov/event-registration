import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { orgEventsQuery } from "@/entities/event";
import { meQuery } from "@/entities/session";
import { routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import AppLayout from "./AppLayout.vue";

const user = { id: 1, email: "demo@example.com" };

async function mountLayout(path: string = routes.home) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = { template: "<p>page</p>" };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.home, component: page },
      { path: routes.login, component: page },
      { path: routes.orgEvents, component: page },
    ],
  });
  await router.push(path);
  const wrapper = mount(AppLayout, {
    slots: { default: "<p>page</p>" },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

function links(wrapper: Awaited<ReturnType<typeof mountLayout>>["wrapper"]) {
  return wrapper.findAll("header a").map((a) => [a.text(), a.attributes("href")]);
}

describe("AppLayout", () => {
  it("shows the page inside the shared main", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 401 })));

    const { wrapper } = await mountLayout();
    await flushPromises();

    expect(wrapper.get("main").text()).toBe("page");
  });

  it("shows nothing on the right while the session is being asked", async () => {
    server.use(
      http.get("*/api/auth/me/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(user);
      }),
    );

    const { wrapper } = await mountLayout();

    expect(links(wrapper)).toEqual([["События", routes.home]]);
    expect(wrapper.find("header button").exists()).toBe(false);
    await flushPromises();
  });

  it("offers a guest to sign in and stays on the page", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 401 })));

    const { wrapper, router } = await mountLayout();
    await flushPromises();

    expect(links(wrapper)).toEqual([
      ["События", routes.home],
      ["Вход для организатора", routes.login],
    ]);
    expect(router.currentRoute.value.path).toBe(routes.home);
  });

  it("offers a guest to sign in when the session cannot be asked", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 500 })));

    const { wrapper } = await mountLayout();
    await flushPromises();

    expect(links(wrapper)).toContainEqual(["Вход для организатора", routes.login]);
  });

  it("shows the organizer their events, email and sign-out", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json(user)));

    const { wrapper } = await mountLayout();
    await flushPromises();

    expect(links(wrapper)).toEqual([
      ["События", routes.home],
      ["Мои события", routes.orgEvents],
    ]);
    expect(wrapper.get("header").text()).toContain("demo@example.com");
    expect(wrapper.get("header button").text()).toBe("Выйти");
  });

  it("signs out, forgets the organizer's data and opens the public events", async () => {
    let signedOut = false;
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json(user)),
      http.post("*/api/auth/logout/", () => {
        signedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { wrapper, router, queryClient } = await mountLayout(routes.orgEvents);
    await flushPromises();
    queryClient.setQueryData(orgEventsQuery.queryKey, []);

    await wrapper.get("header button").trigger("click");
    await flushPromises();

    expect(signedOut).toBe(true);
    expect(router.currentRoute.value.path).toBe(routes.home);
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
    expect(queryClient.getQueryData(orgEventsQuery.queryKey)).toBeUndefined();
    expect(links(wrapper)).toContainEqual(["Вход для организатора", routes.login]);
  });
});
