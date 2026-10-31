import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, orgEventPath, routes } from "@/shared/config";
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
            confirmed: 1,
            waitlisted: 0,
          },
          {
            id: 2,
            title: "Workshop",
            description: "",
            starts_at: "2030-06-01T18:00:00Z",
            capacity: 30,
            confirmed: 12,
            waitlisted: 3,
          },
        ]),
      ),
    );

    const wrapper = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain("Meetup");
    expect(rows[0]?.text()).toContain("Занято 1 из 1");
    expect(rows[1]?.text()).toContain("Занято 12 из 30");
    expect(rows[1]?.text()).toContain("в листе ожидания 3");
    expect(rows[1]?.get(`a[href="${checkinPath(2)}"]`).text()).toBe("Чекин");
    expect(rows[1]?.get(`a[href="${orgEventPath(2)}"]`).text()).toBe("Workshop");
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
            confirmed: 0,
            waitlisted: 0,
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
