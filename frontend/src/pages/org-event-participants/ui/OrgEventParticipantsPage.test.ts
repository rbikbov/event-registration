import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventParticipantsPage from "./OrgEventParticipantsPage.vue";

const REGISTRATIONS = "*/api/org/events/7/registrations/";
const event = {
  id: 7,
  title: "Meetup",
  description: "",
  starts_at: "2030-05-01T18:00:00Z",
  capacity: 2,
  confirmed: 2,
  waitlisted: 1,
  checked_in: 1,
  free_seats: 0,
  cancelled: 0,
};
const ann = {
  id: 1,
  name: "Ann",
  email: "ann@example.com",
  status: "confirmed",
  checked_in_at: "2030-05-01T17:55:00Z",
};
const bob = {
  id: 2,
  name: "Bob",
  email: "bob@example.com",
  status: "confirmed",
  checked_in_at: null,
};
const cid = {
  id: 3,
  name: "Cid",
  email: "cid@example.com",
  status: "waitlisted",
  position: 1,
  checked_in_at: null,
};

// The event comes from the layout (pages/org-event), which reads it and keeps it live.
async function mountPage(query: Record<string, string> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.orgEvent, component: OrgEventParticipantsPage }],
  });
  await router.push({ path: orgEventPath(7), query });
  const wrapper = mount(OrgEventParticipantsPage, {
    props: { event },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

describe("OrgEventParticipantsPage", () => {
  it("shows a loading state until the participants arrive", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([])));

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();
  });

  it("lists the participants with the status, waitlist place and check-in time", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann, bob, cid])));

    const { wrapper } = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll("tbody tr").map((row) => row.findAll("td").map((c) => c.text()));
    const time = new Intl.DateTimeFormat("ru", { timeStyle: "short" }).format(
      new Date(ann.checked_in_at),
    );
    expect(rows).toEqual([
      ["Ann", "ann@example.com", "Подтверждён", time],
      ["Bob", "bob@example.com", "Подтверждён", "—"],
      ["Cid", "cid@example.com", "В листе ожидания, №1", "—"],
    ]);
  });

  it("asks the server for the status from the URL and marks that filter", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(REGISTRATIONS, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("status"));
        return HttpResponse.json([cid]);
      }),
    );

    const { wrapper } = await mountPage({ status: "waitlisted" });
    await flushPromises();

    expect(asked).toEqual(["waitlisted"]);
    expect(wrapper.get('nav a[aria-current="true"]').text()).toBe("Лист ожидания");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("switches the filter through the URL", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(REGISTRATIONS, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("status"));
        return HttpResponse.json([]);
      }),
    );
    const { wrapper, router } = await mountPage();
    await flushPromises();

    const cancelled = wrapper.findAll("nav a").find((a) => a.text() === "Отказались");
    await cancelled?.trigger("click");
    // The new query key starts its request after the navigation, later than one flush.
    await vi.waitFor(() => expect(wrapper.text()).toContain("С таким статусом никого нет"));

    expect(router.currentRoute.value.query).toEqual({ status: "cancelled" });
    expect(asked).toEqual([null, "cancelled"]);
  });

  it("says there are no registrations yet", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([])));

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Регистраций пока нет");
    expect(wrapper.find("table").exists()).toBe(false);
  });

  it("offers a retry when the participants fail to load", async () => {
    let fail = true;
    server.use(
      http.get(REGISTRATIONS, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([ann]),
      ),
    );
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить участников");

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("keeps the table when a refetch of the participants fails", async () => {
    let fail = false;
    server.use(
      http.get(REGISTRATIONS, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([ann, bob]),
      ),
    );
    const { wrapper, queryClient } = await mountPage();
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить участников");
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });
});
