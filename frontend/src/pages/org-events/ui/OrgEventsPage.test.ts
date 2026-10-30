import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventsPage from "./OrgEventsPage.vue";

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.orgEvents, component: OrgEventsPage }],
  });
  await router.push(routes.orgEvents);
  return mount(OrgEventsPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
}

describe("OrgEventsPage", () => {
  it("shows a loading state until the list arrives", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json([])));

    const wrapper = await mountPage();

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();
  });

  it("lists events with their capacity", async () => {
    server.use(
      http.get("*/api/org/events/", () =>
        HttpResponse.json([
          {
            id: 1,
            title: "Meetup",
            description: "",
            starts_at: "2030-05-01T18:00:00Z",
            capacity: 1,
          },
          {
            id: 2,
            title: "Workshop",
            description: "",
            starts_at: "2030-06-01T18:00:00Z",
            capacity: 30,
          },
        ]),
      ),
    );

    const wrapper = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain("Meetup");
    expect(rows[0]?.text()).toContain("1 место");
    expect(rows[1]?.text()).toContain("30 мест");
  });

  it("says there are no events yet and offers to create one", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json([])));

    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Событий пока нет");
    expect(wrapper.get(`a[href="${routes.orgEventsNew}"]`).text()).toBe("Создать событие");
  });

  it("shows an error and loads again on retry", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json({}, { status: 500 })));
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить события");

    server.use(
      http.get("*/api/org/events/", () =>
        HttpResponse.json([
          {
            id: 1,
            title: "Meetup",
            description: "",
            starts_at: "2030-05-01T18:00:00Z",
            capacity: 5,
          },
        ]),
      ),
    );
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Meetup");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
