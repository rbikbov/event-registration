import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { routes } from "@/shared/config";

import { FilterLink } from ".";

async function mountLink(current: boolean) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.home, component: { template: "<div />" } }],
  });
  await router.push(routes.home);
  return mount(FilterLink, {
    props: { to: { path: routes.home, query: { period: "past" } }, current },
    slots: { default: "Прошедшие" },
    global: { plugins: [router] },
  }).get("a");
}

describe("FilterLink", () => {
  it("marks the chosen filter and makes it stand out", async () => {
    const link = await mountLink(true);

    expect(link.attributes("aria-current")).toBe("true");
    expect(link.attributes("data-variant")).toBe("default");
  });

  it("leaves another filter plain", async () => {
    const link = await mountLink(false);

    expect(link.attributes("aria-current")).toBeUndefined();
    expect(link.attributes("data-variant")).toBe("outline");
  });

  it("links to its filter", async () => {
    const link = await mountLink(false);

    expect(link.attributes("href")).toBe(`${routes.home}?period=past`);
    expect(link.text()).toBe("Прошедшие");
  });
});
