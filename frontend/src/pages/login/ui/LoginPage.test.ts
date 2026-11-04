import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { orgEventsQuery } from "@/entities/event";
import { meQuery } from "@/entities/session";
import { checkinPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import LoginPage from "./LoginPage.vue";

async function mountPage(next?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.login, component: LoginPage },
      { path: routes.orgEvents, component: { template: "<div />" } },
      { path: routes.orgCheckin, component: { template: "<div />" } },
    ],
  });
  await router.push({ path: routes.login, query: next === undefined ? {} : { next } });
  const wrapper = mount(LoginPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

async function fill(
  wrapper: Awaited<ReturnType<typeof mountPage>>["wrapper"],
  email: string,
  password: string,
) {
  await wrapper.get("#email").setValue(email);
  await wrapper.get("#password").setValue(password);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
}

describe("LoginPage", () => {
  it("signs in and opens the organizer page", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/auth/login/", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 1, email: "demo@example.com" });
      }),
    );
    const { wrapper, router, queryClient } = await mountPage();

    await fill(wrapper, "demo@example.com", "demo");

    expect(body).toEqual({ email: "demo@example.com", password: "demo" });
    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({
      id: 1,
      email: "demo@example.com",
    });
  });

  it("returns to the page the organizer was sent from", async () => {
    server.use(
      http.post("*/api/auth/login/", () => HttpResponse.json({ id: 1, email: "demo@example.com" })),
    );
    const { wrapper, router } = await mountPage(checkinPath(7));

    await fill(wrapper, "demo@example.com", "demo");

    expect(router.currentRoute.value.fullPath).toBe(checkinPath(7));
  });

  it("opens the organizer page when the way back leads off the site", async () => {
    server.use(
      http.post("*/api/auth/login/", () => HttpResponse.json({ id: 1, email: "demo@example.com" })),
    );
    const { wrapper, router } = await mountPage("//evil.example");

    await fill(wrapper, "demo@example.com", "demo");

    expect(router.currentRoute.value.fullPath).toBe(routes.orgEvents);
  });

  it("forgets what the previous user saw before opening the organizer page", async () => {
    server.use(
      http.post("*/api/auth/login/", () =>
        HttpResponse.json({ id: 2, email: "other@example.com" }),
      ),
    );
    const { wrapper, router, queryClient } = await mountPage();
    // Left by the organizer whose session ended with a 401 in this tab.
    queryClient.setQueryData(orgEventsQuery("upcoming", 1).queryKey, {
      count: 1,
      results: [
        {
          id: 1,
          title: "Not yours",
          starts_at: "2030-05-01T18:00:00Z",
          capacity: 10,
          confirmed: 3,
          waitlisted: 0,
        },
      ],
    });

    await fill(wrapper, "other@example.com", "secret");

    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
    expect(queryClient.getQueryData(orgEventsQuery("upcoming", 1).queryKey)).toBeUndefined();
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({
      id: 2,
      email: "other@example.com",
    });
  });

  it("shows field errors without sending a request", async () => {
    const { wrapper } = await mountPage();

    await fill(wrapper, "", "");

    expect(wrapper.text()).toContain("Обязательное поле");
  });

  it("shows the email format hint with a literal @", async () => {
    const { wrapper } = await mountPage();

    await fill(wrapper, "not-an-email", "x");

    expect(wrapper.text()).toContain("name@example.com");
  });

  it("shows an error for wrong credentials and stays on the page", async () => {
    server.use(http.post("*/api/auth/login/", () => HttpResponse.json({}, { status: 400 })));
    const { wrapper, router } = await mountPage();

    await fill(wrapper, "demo@example.com", "wrong");

    expect(wrapper.get('[role="alert"]').text()).toBe("Неверный email или пароль");
    expect(router.currentRoute.value.path).toBe(routes.login);
  });

  it("shows a different error when the server fails", async () => {
    server.use(http.post("*/api/auth/login/", () => HttpResponse.json({}, { status: 500 })));
    const { wrapper } = await mountPage();

    await fill(wrapper, "demo@example.com", "demo");

    expect(wrapper.get('[role="alert"]').text()).toBe("Не удалось войти, попробуйте позже");
  });

  it("disables the button while the request is in flight", async () => {
    server.use(
      http.post("*/api/auth/login/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ id: 1, email: "demo@example.com" });
      }),
    );
    const { wrapper } = await mountPage();
    await wrapper.get("#email").setValue("demo@example.com");
    await wrapper.get("#password").setValue("demo");

    await wrapper.get("form").trigger("submit");

    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await flushPromises();
  });
});
