import { focusManager, QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => focusManager.setFocused(undefined));

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
    // The answer arrives after a timer, not a tick: wait for it, so it does not outlive the test.
    await vi.waitFor(() => expect(wrapper.find("header button").exists()).toBe(true));
  });

  // That the guest also stays on the page is for the app's router to show: session-expiry.test.ts.
  it("offers a guest to sign in", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 401 })));

    const { wrapper } = await mountLayout();
    await flushPromises();

    expect(links(wrapper)).toEqual([
      ["События", routes.home],
      ["Вход для организатора", routes.login],
    ]);
  });

  it("does not ask the session again when the window gets the focus back", async () => {
    let requests = 0;
    server.use(
      http.get("*/api/auth/me/", () => {
        requests += 1;
        return HttpResponse.json(user);
      }),
    );
    const { wrapper } = await mountLayout();
    await flushPromises();

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await flushPromises();

    expect(requests).toBe(1);
    wrapper.unmount();
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

  it("keeps the session and says so when signing out fails", async () => {
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json(user)),
      http.post("*/api/auth/logout/", () => HttpResponse.json({}, { status: 500 })),
    );
    const { wrapper, router, queryClient } = await mountLayout(routes.orgEvents);
    await flushPromises();

    await wrapper.get("header button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Не удалось выйти, повторите");
    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual(user);
    expect(wrapper.get("header button").text()).toBe("Выйти");
  });

  it("takes 401 on sign-out as signed out: the session has already ended", async () => {
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json(user)),
      http.post("*/api/auth/logout/", () => HttpResponse.json({}, { status: 401 })),
    );
    const { wrapper, router, queryClient } = await mountLayout(routes.orgEvents);
    await flushPromises();

    await wrapper.get("header button").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(router.currentRoute.value.path).toBe(routes.home);
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
  });

  it("sends one request when sign-out is clicked twice", async () => {
    let requests = 0;
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json(user)),
      http.post("*/api/auth/logout/", async () => {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { wrapper } = await mountLayout(routes.orgEvents);
    await flushPromises();

    const button = wrapper.get("header button");
    await button.trigger("click");
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");
    await vi.waitFor(() => expect(wrapper.find("header button").exists()).toBe(false));

    expect(requests).toBe(1);
  });

  it("drops the sign-out error on the next screen", async () => {
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json(user)),
      http.post("*/api/auth/logout/", () => HttpResponse.json({}, { status: 500 })),
    );
    const { wrapper, router } = await mountLayout(routes.orgEvents);
    await flushPromises();
    await wrapper.get("header button").trigger("click");
    await flushPromises();

    await router.push(routes.home);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
