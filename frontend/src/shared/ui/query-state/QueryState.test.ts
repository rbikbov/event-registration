import { QueryClient, VueQueryPlugin, useQuery } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { createAppI18n } from "@/shared/lib/i18n";

import { QueryState } from ".";

// A real query, not a hand-made state: the case under test is how TanStack Query reports a
// failed refetch (isError with the previous data kept).
function mountWith(load: () => Promise<string>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = defineComponent({
    setup() {
      const query = useQuery({ queryKey: ["thing"], queryFn: load });
      return () =>
        h(
          QueryState,
          { query, errorText: "Не удалось загрузить", refreshErrorText: "Не удалось обновить" },
          { default: ({ data }: { data: string }) => h("p", { "data-shown": "" }, data) },
        );
    },
  });
  const wrapper = mount(Page, {
    global: { plugins: [[VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, queryClient };
}

describe("QueryState", () => {
  it("shows a loading state until the data arrives, then the data", async () => {
    const { wrapper } = mountWith(() => Promise.resolve("Meetup"));

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get("[data-shown]").text()).toBe("Meetup");
  });

  it("shows the error in place of the data that never loaded, and loads again on retry", async () => {
    let fail = true;
    const { wrapper } = mountWith(() =>
      fail ? Promise.reject(new Error("down")) : Promise.resolve("Meetup"),
    );
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить");
    expect(wrapper.find("[data-shown]").exists()).toBe(false);

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get("[data-shown]").text()).toBe("Meetup");
  });

  it("keeps the data on screen when a refetch fails, with the error above it", async () => {
    let fail = false;
    const { wrapper, queryClient } = mountWith(() =>
      fail ? Promise.reject(new Error("down")) : Promise.resolve("Meetup"),
    );
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить");
    expect(wrapper.get("[data-shown]").text()).toBe("Meetup");

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows the loading state while a retry of the first load is under way", async () => {
    let calls = 0;
    const { wrapper } = mountWith(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("down")) : new Promise<string>(() => {});
    });
    await flushPromises();

    await wrapper.get('[role="alert"] button').trigger("click");

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows that a retry of a refetch is under way and blocks a second one", async () => {
    let calls = 0;
    let finish: (value: string) => void = () => {};
    const { wrapper, queryClient } = mountWith(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve("Meetup");
      if (calls === 2) return Promise.reject(new Error("down"));
      return new Promise<string>((resolve) => (finish = resolve));
    });
    await flushPromises();
    await queryClient.refetchQueries();
    await flushPromises();

    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    const button = wrapper.get('[role="alert"] button');
    expect(button.text()).toBe("Загружаем…");
    expect(button.attributes("disabled")).toBeDefined();
    expect(wrapper.get("[data-shown]").text()).toBe("Meetup");
    await button.trigger("click");
    expect(calls).toBe(3);

    finish("Meetup 2");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get("[data-shown]").text()).toBe("Meetup 2");
  });
});
