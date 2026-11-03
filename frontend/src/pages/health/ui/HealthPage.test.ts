import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import HealthPage from "./HealthPage.vue";

function mountWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(HealthPage, {
    global: { plugins: [[VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, queryClient };
}

function mountPage() {
  return mountWithClient().wrapper;
}

describe("HealthPage", () => {
  it("does not link the error to this very page", async () => {
    server.use(
      http.get("*/api/health/", () =>
        HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );

    const wrapper = mountPage();
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true));

    expect(wrapper.find('[role="alert"] a').exists()).toBe(false);
  });

  it("shows backend and database status", async () => {
    server.use(
      http.get("*/api/health/", () => HttpResponse.json({ status: "ok", database: "ok" })),
    );

    const wrapper = mountPage();
    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");

    await vi.waitFor(() =>
      expect(wrapper.get("[data-health]").text()).toBe("Backend и база данных работают"),
    );
  });

  it("says the service does not answer on a 503", async () => {
    server.use(
      http.get("*/api/health/", () =>
        HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );

    const wrapper = mountPage();

    // The answer of MSW may come later than a tick: wait for the result, not for the promises.
    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"] h2').text()).toBe("Backend или база данных не отвечают"),
    );
  });

  it("asks the backend again on retry", async () => {
    let up = false;
    server.use(
      http.get("*/api/health/", () =>
        up
          ? HttpResponse.json({ status: "ok", database: "ok" })
          : HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );
    const wrapper = mountPage();
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true));

    up = true;
    await wrapper.get('[role="alert"] button').trigger("click");

    await vi.waitFor(() => expect(wrapper.find("[data-health]").exists()).toBe(true));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("keeps the last answer on screen when a refetch fails, with the error above it", async () => {
    let up = true;
    server.use(
      http.get("*/api/health/", () =>
        up
          ? HttpResponse.json({ status: "ok", database: "ok" })
          : HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );
    const { wrapper, queryClient } = mountWithClient();
    await vi.waitFor(() => expect(wrapper.find("[data-health]").exists()).toBe(true));

    up = false;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Backend или база данных перестали отвечать",
    );
    expect(wrapper.get("[data-health]").text()).toBe("Backend и база данных работают");
  });
});
