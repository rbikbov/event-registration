import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { createAppI18n } from "@/shared/lib/i18n";

import { RetryAlert } from ".";

function mountAlert(fetching: boolean) {
  return mount(RetryAlert, {
    props: { text: "Не удалось обновить", fetching },
    global: { plugins: [createAppI18n()] },
  });
}

describe("RetryAlert", () => {
  it("shows the text and asks for a retry on click", async () => {
    const wrapper = mountAlert(false);

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить");
    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("shows that the request is under way and takes no second click", async () => {
    const wrapper = mountAlert(true);

    const button = wrapper.get("button");
    expect(button.text()).toBe("Загружаем…");
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");

    expect(wrapper.emitted("retry")).toBeUndefined();
  });
});
