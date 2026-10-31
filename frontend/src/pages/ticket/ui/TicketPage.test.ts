import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import TicketPage from "./TicketPage.vue";

import { publicEventsQuery } from "@/entities/event";
import { routes, ticketPath } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

const event = { id: 7, title: "Meetup", starts_at: "2030-05-01T15:00:00Z" };
const confirmed = { status: "confirmed", ticket_code: "ABCD2345", name: "Ann", event };
const waitlisted = { status: "waitlisted", position: 3, name: "Ann", event };
const cancelled = { status: "cancelled", name: "Ann", event };

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.ticket, component: TicketPage },
      { path: routes.event, component: { template: "<div />" } },
    ],
  });
  await router.push(ticketPath("tok"));
  const wrapper = mount(TicketPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
  return { wrapper, queryClient };
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>["wrapper"];

function ticketIs(...bodies: object[]): void {
  let reads = 0;
  server.use(
    http.get("*/api/tickets/tok/", () => {
      const body = bodies[Math.min(reads, bodies.length - 1)];
      reads += 1;
      return HttpResponse.json(body);
    }),
  );
}

function button(wrapper: Wrapper, text: string) {
  const found = wrapper.findAll("button").find((b) => b.text() === text);
  if (found === undefined) throw new Error(`No button "${text}"`);
  return found;
}

async function confirmCancel(wrapper: Wrapper) {
  await button(wrapper, "Отказаться").trigger("click");
  await button(wrapper, "Да, отказаться").trigger("click");
}

describe("TicketPage", () => {
  it("shows the code and the event of a confirmed ticket", async () => {
    ticketIs(confirmed);

    const { wrapper } = await mountPage();

    const text = wrapper.text();
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(text).toContain("Ann");
    expect(text).toContain("Отказаться");
  });

  it("shows the waitlist place without a code", async () => {
    ticketIs(waitlisted);

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("Вы в листе ожидания, №3");
    expect(wrapper.find("[data-ticket-code]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Отказаться");
  });

  it("shows a cancelled ticket with a link back to the event", async () => {
    ticketIs(cancelled);

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("Регистрация отменена");
    expect(wrapper.get("a[href='/events/7']").text()).toBe("Зарегистрироваться снова");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("says the ticket is not found for an unknown token", async () => {
    server.use(http.get("*/api/tickets/tok/", () => HttpResponse.json({}, { status: 404 })));

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="alert"]').text()).toBe("Билет не найден");
  });

  it("shows a load error with a retry", async () => {
    server.use(http.get("*/api/tickets/tok/", () => HttpResponse.json({}, { status: 500 })));
    const { wrapper } = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить билет");

    ticketIs(confirmed);
    await button(wrapper, "Повторить").trigger("click");

    await vi.waitFor(() => expect(wrapper.find("[data-ticket-code]").exists()).toBe(true));
  });

  it("asks before cancelling and keeps the ticket on 'no'", async () => {
    ticketIs(confirmed);
    const { wrapper } = await mountPage();

    await button(wrapper, "Отказаться").trigger("click");
    expect(wrapper.text()).toContain("Отказаться от регистрации?");
    await button(wrapper, "Нет").trigger("click");

    expect(wrapper.text()).not.toContain("Отказаться от регистрации?");
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
  });

  it("cancels, rereads the ticket and refreshes the events", async () => {
    ticketIs(confirmed, cancelled);
    let cancels = 0;
    server.use(
      http.post("*/api/tickets/tok/cancel/", () => {
        cancels += 1;
        return HttpResponse.json({ status: "cancelled" });
      }),
    );
    const { wrapper, queryClient } = await mountPage();
    queryClient.setQueryData(publicEventsQuery.queryKey, []);

    await confirmCancel(wrapper);

    await vi.waitFor(() => expect(wrapper.text()).toContain("Регистрация отменена"));
    expect(cancels).toBe(1);
    expect(queryClient.getQueryState(publicEventsQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("disables the confirm button while the cancel is in flight", async () => {
    ticketIs(confirmed, cancelled);
    server.use(
      http.post("*/api/tickets/tok/cancel/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ status: "cancelled" });
      }),
    );
    const { wrapper } = await mountPage();

    await confirmCancel(wrapper);

    expect(button(wrapper, "Отменяем…").attributes("disabled")).toBeDefined();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Регистрация отменена"));
  });

  it("keeps the ticket and shows an error when the cancel fails", async () => {
    ticketIs(confirmed);
    server.use(http.post("*/api/tickets/tok/cancel/", () => HttpResponse.error()));
    const { wrapper } = await mountPage();

    await confirmCancel(wrapper);

    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"]').text()).toBe("Не удалось отказаться, попробуйте позже"),
    );
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
  });
});
