import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { meQuery } from "@/entities/session";
import { server } from "@/shared/lib/test/msw";

import LoginPage from "./LoginPage.vue";

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: LoginPage },
      { path: "/org/events", component: { template: "<div />" } },
    ],
  });
  await router.push("/login");
  const wrapper = mount(LoginPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
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
    expect(router.currentRoute.value.path).toBe("/org/events");
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({
      id: 1,
      email: "demo@example.com",
    });
  });

  it("shows field errors without sending a request", async () => {
    const { wrapper } = await mountPage();

    await fill(wrapper, "", "");

    expect(wrapper.text()).toContain("Обязательное поле");
  });

  it("shows an error for wrong credentials and stays on the page", async () => {
    server.use(http.post("*/api/auth/login/", () => HttpResponse.json({}, { status: 400 })));
    const { wrapper, router } = await mountPage();

    await fill(wrapper, "demo@example.com", "wrong");

    expect(wrapper.get('[role="alert"]').text()).toBe("Неверный email или пароль");
    expect(router.currentRoute.value.path).toBe("/login");
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
