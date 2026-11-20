import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import TicketPage from "./TicketPage.vue";

import { publicEventQuery, publicEventsQuery } from "@/entities/event";
import { routes, ticketPath } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

const event = { id: 7, title: "Meetup", starts_at: "2030-05-01T15:00:00Z" };
const confirmed = {
  status: "confirmed",
  ticket_code: "ABCD2345",
  name: "Ann",
  checked_in_at: null,
  event,
};
const checkedIn = { ...confirmed, checked_in_at: "2030-05-01T15:42:00Z" };
const waitlisted = { status: "waitlisted", position: 3, name: "Ann", checked_in_at: null, event };
const cancelled = { status: "cancelled", name: "Ann", checked_in_at: null, event };

afterEach(() => vi.useRealTimers());

// The page reads the clock to tell today's check-in from an earlier one; timers stay real.
function nowIs(moment: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(moment);
}

function dayAfter(iso: string): Date {
  return new Date(new Date(iso).getTime() + 24 * 60 * 60 * 1000);
}

async function mountPage({ loaded = true } = {}) {
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
  if (loaded) {
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
  }
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
  await button(wrapper, "Cancel").trigger("click");
  await button(wrapper, "Yes, cancel").trigger("click");
}

describe("TicketPage", () => {
  it("shows the code and the event of a confirmed ticket", async () => {
    ticketIs(confirmed);

    const { wrapper } = await mountPage();

    const text = wrapper.text();
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
    expect(wrapper.get("h1").text()).toBe("Meetup");
    // The format of a page of one event (shared/lib/i18n).
    expect(text).toContain(createAppI18n().global.d(new Date(event.starts_at), "long"));
    expect(text).toContain("Ann");
    expect(text).toContain("Cancel");
  });

  it("says a checked-in ticket was let in, and offers no cancel", async () => {
    nowIs(new Date(checkedIn.checked_in_at));
    ticketIs(checkedIn);

    const { wrapper } = await mountPage();

    // The time is shown in the browser's time zone, like the rest of the app.
    const time = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(
      new Date(checkedIn.checked_in_at),
    );
    const notice = wrapper.get("[data-checked-in]").text();
    expect(notice).toContain("Ticket used");
    expect(notice).toContain(`You were checked in at ${time}`);
    expect(notice).toContain("This code cannot be used again");
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
    expect(wrapper.text()).not.toContain("Cancel");
  });

  it("gives the date of a check-in made on another day", async () => {
    nowIs(dayAfter(checkedIn.checked_in_at));
    ticketIs(checkedIn);

    const { wrapper } = await mountPage();

    const moment = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(checkedIn.checked_in_at));
    expect(wrapper.get("[data-checked-in]").text()).toContain(`You were checked in ${moment}.`);
  });

  it("shows the waitlist place without a code", async () => {
    ticketIs(waitlisted);

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("You are on the waitlist, #3");
    expect(wrapper.find("[data-ticket-code]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Cancel");
  });

  it("shows a cancelled ticket with a link back to the event", async () => {
    ticketIs(cancelled);

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("Registration cancelled");
    expect(wrapper.get("a[href='/events/7']").text()).toBe("Register again");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("says the ticket is not found for an unknown token", async () => {
    server.use(http.get("*/api/tickets/tok/", () => HttpResponse.json({}, { status: 404 })));

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="alert"] h1').text()).toBe("Ticket not found");
  });

  it("shows a loading state until the ticket arrives", async () => {
    server.use(http.get("*/api/tickets/tok/", () => HttpResponse.json(confirmed)));
    const { wrapper } = await mountPage({ loaded: false });

    expect(wrapper.get('[role="status"]').text()).toBe("Loading…");
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
    expect(wrapper.text()).toContain("Meetup");
  });

  it("shows a load error with a retry", async () => {
    server.use(http.get("*/api/tickets/tok/", () => HttpResponse.json({}, { status: 500 })));
    const { wrapper } = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not load the ticket");

    ticketIs(confirmed);
    await button(wrapper, "Retry").trigger("click");

    await vi.waitFor(() => expect(wrapper.find("[data-ticket-code]").exists()).toBe(true));
  });

  it("keeps the loaded ticket when a later read fails", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/tickets/tok/", () => {
        reads += 1;
        return reads === 1 ? HttpResponse.json(confirmed) : HttpResponse.error();
      }),
    );
    const { wrapper, queryClient } = await mountPage();

    await queryClient.invalidateQueries({ queryKey: ["tickets", "tok"] });

    await vi.waitFor(() => expect(reads).toBe(2));
    await vi.waitFor(() =>
      expect(queryClient.getQueryState(["tickets", "tok"])?.status).toBe("error"),
    );
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not refresh the ticket");
  });

  it("asks before cancelling and keeps the ticket on 'no'", async () => {
    ticketIs(confirmed);
    const { wrapper } = await mountPage();

    await button(wrapper, "Cancel").trigger("click");
    expect(wrapper.text()).toContain("Cancel the registration?");
    await button(wrapper, "No").trigger("click");

    expect(wrapper.text()).not.toContain("Cancel the registration?");
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
    // The second page of the list and the event, as the participant may have opened them.
    const listPage = publicEventsQuery("past", 2).queryKey;
    queryClient.setQueryData(listPage, { count: 0, results: [] });
    queryClient.setQueryData(publicEventQuery(event.id).queryKey, {
      ...event,
      description: "",
      capacity: 5,
      free_seats: 0,
    });

    await confirmCancel(wrapper);

    await vi.waitFor(() => expect(wrapper.text()).toContain("Registration cancelled"));
    // The text shows from the cancel answer, before the rereads: the lists are reset only after
    // the ticket is reread, so wait for the mutation to finish.
    await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(cancels).toBe(1);
    expect(queryClient.getQueryState(listPage)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(publicEventQuery(event.id).queryKey)?.isInvalidated).toBe(
      true,
    );
  });

  it("shows the cancellation even when rereading the ticket after it fails", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/tickets/tok/", () => {
        reads += 1;
        return reads === 1 ? HttpResponse.json(confirmed) : HttpResponse.error();
      }),
      http.post("*/api/tickets/tok/cancel/", () => HttpResponse.json({ status: "cancelled" })),
    );
    const { wrapper } = await mountPage();

    await confirmCancel(wrapper);

    await vi.waitFor(() => expect(reads).toBe(2));
    await vi.waitFor(() => expect(wrapper.text()).toContain("Could not refresh the ticket"));
    expect(wrapper.text()).toContain("Registration cancelled");
    expect(wrapper.find("[data-ticket-code]").exists()).toBe(false);
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

    expect(button(wrapper, "Cancelling…").attributes("disabled")).toBeDefined();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Registration cancelled"));
  });

  it("rereads the ticket when it was checked in while the page was open", async () => {
    ticketIs(confirmed, checkedIn);
    server.use(
      http.post("*/api/tickets/tok/cancel/", () => HttpResponse.json({}, { status: 409 })),
    );
    const { wrapper } = await mountPage();

    await confirmCancel(wrapper);

    await vi.waitFor(() => expect(wrapper.text()).toContain("You were checked in"));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Cancel");
  });

  it("keeps the ticket and shows an error when the cancel fails", async () => {
    ticketIs(confirmed);
    server.use(http.post("*/api/tickets/tok/cancel/", () => HttpResponse.error()));
    const { wrapper } = await mountPage();

    await confirmCancel(wrapper);

    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"]').text()).toBe("Could not cancel, try again later"),
    );
    expect(wrapper.get("[data-ticket-code]").text()).toBe("ABCD2345");
  });
});
