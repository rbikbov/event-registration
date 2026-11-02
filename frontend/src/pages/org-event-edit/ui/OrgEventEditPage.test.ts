import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { eventFormInput, orgEventQuery, type OrgEvent } from "@/entities/event";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventEditPage from "./OrgEventEditPage.vue";

const EVENT = "*/api/org/events/7/";

function nextYear(month = "05"): string {
  return `${new Date().getFullYear() + 1}-${month}-01T18:00`;
}

const event: OrgEvent = {
  id: 7,
  title: "Meetup",
  description: "Talks",
  starts_at: new Date(nextYear()).toISOString(),
  capacity: 3,
  confirmed: 2,
  waitlisted: 1,
  checked_in: 0,
  free_seats: 1,
  cancelled: 0,
};

function mountPage(loaded: OrgEvent = event) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(OrgEventEditPage, {
    props: { event: loaded },
    global: { plugins: [[VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, queryClient };
}

type Wrapper = ReturnType<typeof mountPage>["wrapper"];

// Answers each PATCH with the event and the fields sent; keeps the bodies.
function patched(answer?: () => Response | Promise<Response>) {
  const bodies: unknown[] = [];
  server.use(
    http.patch(EVENT, async ({ request }) => {
      const body = (await request.json()) as Partial<OrgEvent>;
      bodies.push(body);
      return answer ? answer() : HttpResponse.json({ ...event, ...body });
    }),
  );
  return bodies;
}

// The number field applies what was typed on blur or Enter, not on every keystroke.
async function type(wrapper: Wrapper, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    await wrapper.get(`#${id}`).setValue(value);
    await wrapper.get(`#${id}`).trigger("blur");
  }
}

async function submit(wrapper: Wrapper) {
  await wrapper.get("form").trigger("submit");
  await flushPromises();
}

function saveButton(wrapper: Wrapper) {
  return wrapper.get('button[type="submit"]');
}

function button(wrapper: Wrapper, text: string) {
  const found = wrapper.findAll("button").find((b) => b.text() === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

describe("OrgEventEditPage", () => {
  it("fills the fields with the event and has nothing to save yet", () => {
    const { wrapper } = mountPage();

    const form = eventFormInput(event);
    expect((wrapper.get("#title").element as HTMLInputElement).value).toBe(form.title);
    expect((wrapper.get("#description").element as HTMLInputElement).value).toBe("Talks");
    expect((wrapper.get("#starts_at").element as HTMLInputElement).value).toBe(form.starts_at);
    expect((wrapper.get("#capacity").element as HTMLInputElement).value).toBe("3");
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined();
  });

  // The number field applies what was typed on blur, and a press on the button blurs it only
  // after the press has met a disabled button: one click must still save.
  it("lets the button be pressed while a typed capacity is not applied yet", async () => {
    const { wrapper } = mountPage();

    await wrapper.get("#capacity").setValue("5");

    expect(saveButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("sends only the changed fields and puts the answer into the event cache", async () => {
    const bodies = patched();
    const { wrapper, queryClient } = mountPage();

    await type(wrapper, { title: "Renamed", capacity: "5" });
    await submit(wrapper);

    expect(bodies).toEqual([{ title: "Renamed", capacity: 5 }]);
    expect(wrapper.get('[role="status"]').text()).toBe("Сохранено");
    expect(queryClient.getQueryData(orgEventQuery(7).queryKey)).toMatchObject({
      title: "Renamed",
      capacity: 5,
    });
    // The saved values are the new starting point.
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("asks before a reschedule, naming who gets the email", async () => {
    const bodies = patched();
    const { wrapper } = mountPage();

    await type(wrapper, { starts_at: nextYear("06") });
    await submit(wrapper);

    expect(bodies).toEqual([]);
    expect(wrapper.get('[data-confirm="reschedule"]').text()).toContain(
      "Участникам (подтверждено 2, в листе 1) уйдёт письмо о переносе",
    );
    await button(wrapper, "Перенести").trigger("click");
    await flushPromises();

    expect(bodies).toEqual([{ starts_at: new Date(nextYear("06")).toISOString() }]);
    expect(wrapper.find('[data-confirm="reschedule"]').exists()).toBe(false);
  });

  it("sends nothing when the reschedule is called off, and keeps the new date", async () => {
    const bodies = patched();
    const { wrapper } = mountPage();
    await type(wrapper, { starts_at: nextYear("06") });
    await submit(wrapper);

    await button(wrapper, "Отмена").trigger("click");
    await flushPromises();

    expect(bodies).toEqual([]);
    expect(wrapper.find('[data-confirm="reschedule"]').exists()).toBe(false);
    expect((wrapper.get("#starts_at").element as HTMLInputElement).value).toBe(nextYear("06"));
  });

  it("reschedules an event without participants at once: nobody gets an email", async () => {
    const bodies = patched();
    const { wrapper } = mountPage({ ...event, confirmed: 0, waitlisted: 0 });

    await type(wrapper, { starts_at: nextYear("06") });
    await submit(wrapper);

    expect(bodies).toHaveLength(1);
  });

  it("shows field errors without sending a request", async () => {
    const bodies = patched();
    const { wrapper } = mountPage();

    await type(wrapper, { title: " ", starts_at: "2020-01-01T10:00" });
    await submit(wrapper);

    expect(bodies).toEqual([]);
    expect(wrapper.text()).toContain("Обязательное поле");
    expect(wrapper.text()).toContain("Начало должно быть в будущем");
  });

  it("explains a capacity below the confirmed seats", async () => {
    patched(() =>
      HttpResponse.json({ errors: { capacity: ["below_confirmed"] } }, { status: 400 }),
    );
    const { wrapper } = mountPage();

    await type(wrapper, { capacity: "1" });
    await submit(wrapper);

    expect(wrapper.text()).toContain("Не меньше подтверждённых: 2");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("keeps the values after a failure and tells to try later", async () => {
    patched(() => HttpResponse.error());
    const { wrapper } = mountPage();

    await type(wrapper, { title: "Renamed" });
    await submit(wrapper);

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Не удалось сохранить событие, попробуйте позже",
    );
    expect((wrapper.get("#title").element as HTMLInputElement).value).toBe("Renamed");
    expect(saveButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("blocks a second submit while saving", async () => {
    const bodies = patched(async () => {
      await delay(50);
      return HttpResponse.json({ ...event, title: "Renamed" });
    });
    const { wrapper } = mountPage();
    await type(wrapper, { title: "Renamed" });

    await wrapper.get("form").trigger("submit");
    await wrapper.vm.$nextTick();
    expect(saveButton(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await flushPromises();

    expect(bodies).toHaveLength(1);
  });
});
