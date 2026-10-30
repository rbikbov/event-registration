import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import HealthPage from "./HealthPage.vue";

function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(HealthPage, {
    global: { plugins: [[VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
}

describe("HealthPage", () => {
  it("shows backend and database status", async () => {
    server.use(
      http.get("*/api/health/", () => HttpResponse.json({ status: "ok", database: "ok" })),
    );

    const wrapper = mountPage();
    expect(wrapper.text()).toContain("Проверяем backend…");
    await flushPromises();

    expect(wrapper.text()).toContain("Backend: ok, база данных: ok");
  });

  it("shows an error when the backend is unavailable", async () => {
    server.use(
      http.get("*/api/health/", () =>
        HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Backend недоступен");
  });
});
