import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, orgEventPath, routes } from "@/shared/config";

import { NavLink } from ".";

const page = { template: "<p>page</p>" };

// A layout route with tabs, as the organizer's event has: the first tab shares the parent's path.
async function mountLinks(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.orgEvents, component: page },
      {
        path: routes.orgEvent,
        component: page,
        children: [
          { path: routes.orgEvent, component: page },
          { path: routes.orgCheckin, component: page },
        ],
      },
    ],
  });
  await router.push(path);
  const Links = defineComponent(() => () => [
    h(NavLink, { to: routes.orgEvents }, () => "list"),
    h(NavLink, { to: orgEventPath(1) }, () => "participants"),
    h(NavLink, { to: checkinPath(1) }, () => "checkin"),
  ]);
  return mount(Links, { global: { plugins: [router] } });
}

// The text, `aria-current` and the look of every link.
function current(wrapper: Awaited<ReturnType<typeof mountLinks>>) {
  return wrapper
    .findAll("a")
    .map((a) => [a.text(), a.attributes("aria-current") ?? null, a.attributes("data-variant")]);
}

describe("NavLink", () => {
  it.each([
    [routes.orgEvents, "list"],
    [orgEventPath(1), "participants"],
    // The participants tab is the parent's own path: it is not current on another tab.
    [checkinPath(1), "checkin"],
  ])("marks only the link of %s as the current page", async (path, name) => {
    const wrapper = await mountLinks(path);

    expect(current(wrapper)).toEqual(
      ["list", "participants", "checkin"].map((text) =>
        text === name ? [text, "page", "default"] : [text, null, "ghost"],
      ),
    );
  });

  it("marks nothing on a page no link leads to", async () => {
    const wrapper = await mountLinks(orgEventPath(2));

    expect(current(wrapper).map(([, aria, look]) => [aria, look])).toEqual([
      [null, "ghost"],
      [null, "ghost"],
      [null, "ghost"],
    ]);
  });

  it("links to its page", async () => {
    const wrapper = await mountLinks(routes.orgEvents);

    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toEqual([
      routes.orgEvents,
      orgEventPath(1),
      checkinPath(1),
    ]);
  });
});
