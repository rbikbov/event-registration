import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";

import { PageNav } from ".";

const link = (page: number) => ({ path: routes.home, query: page > 1 ? { page } : {} });

async function mountNav(page: number, pages: number) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.home, component: { template: "<div />" } }],
  });
  await router.push(link(page));
  const wrapper = mount(PageNav, {
    props: { page, pages, link, label: "Страницы событий" },
    global: { plugins: [router, createAppI18n()] },
  });
  return { wrapper, router };
}

type Wrapper = Awaited<ReturnType<typeof mountNav>>["wrapper"];

// What the bar shows, in order: page numbers, "…" and the edge buttons by their names, the
// current page and the disabled buttons marked.
function bar(wrapper: Wrapper): string[] {
  return wrapper.findAll("button, [data-slot='pagination-ellipsis']").map((item) => {
    if (item.attributes("data-slot") === "pagination-ellipsis") return "…";
    const name = item.attributes("aria-label") ?? "";
    if (item.attributes("aria-current") === "page") return `[${item.text()}]`;
    if (item.attributes("data-type") === "page") return item.text();
    return item.attributes("disabled") === undefined ? name : `${name} (off)`;
  });
}

describe("PageNav", () => {
  it("is named for screen readers", async () => {
    const { wrapper } = await mountNav(1, 3);

    expect(wrapper.get("nav").attributes("aria-label")).toBe("Страницы событий");
  });

  it("on the first page: no way back, the next pages and a gap before the last", async () => {
    const { wrapper } = await mountNav(1, 10);

    expect(bar(wrapper)).toEqual([
      "Первая страница (off)",
      "Предыдущая страница (off)",
      "[1]",
      "2",
      "3",
      "…",
      "Следующая страница",
      "Последняя страница",
    ]);
  });

  it("in the middle: the neighbours of the current page with gaps on both sides", async () => {
    const { wrapper } = await mountNav(5, 10);

    expect(bar(wrapper)).toEqual([
      "Первая страница",
      "Предыдущая страница",
      "…",
      "4",
      "[5]",
      "6",
      "…",
      "Следующая страница",
      "Последняя страница",
    ]);
  });

  it("on the last page: no way forward", async () => {
    const { wrapper } = await mountNav(10, 10);

    expect(bar(wrapper)).toEqual([
      "Первая страница",
      "Предыдущая страница",
      "…",
      "8",
      "9",
      "[10]",
      "Следующая страница (off)",
      "Последняя страница (off)",
    ]);
  });

  it("names each page number", async () => {
    const { wrapper } = await mountNav(1, 2);

    expect(wrapper.findAll("[data-type='page']").map((b) => b.attributes("aria-label"))).toEqual([
      "Страница 1",
      "Страница 2",
    ]);
  });

  it.each([
    ["one page", 1, 1],
    // Past the end the page says so and links to the last one: a bar here would offer "next".
    ["a page past the end", 4, 3],
  ])("is not shown on %s", async (_, page, pages) => {
    const { wrapper } = await mountNav(page, pages);

    expect(wrapper.find("nav").exists()).toBe(false);
  });

  it.each([
    ["4", 4],
    ["Первая страница", 1],
    ["Предыдущая страница", 4],
    ["Следующая страница", 6],
    ["Последняя страница", 10],
  ])("goes to the page of %s by its link", async (name, page) => {
    const { wrapper, router } = await mountNav(5, 10);

    const button = wrapper
      .findAll("button")
      .find((b) => b.text() === name || b.attributes("aria-label") === name);
    await button?.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe(router.resolve(link(page)).fullPath);
  });
});
