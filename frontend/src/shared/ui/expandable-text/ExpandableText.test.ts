import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { createAppI18n } from "@/shared/lib/i18n";

import { ExpandableText } from ".";

// jsdom lays nothing out: the heights the browser would give the clamped paragraph are set here.
function layout(full: number, shown: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(full);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(shown);
}

// The paragraph is measured once mounted; the button comes with the render after that.
async function mountText(text: string) {
  const wrapper = mount(ExpandableText, {
    props: { text },
    global: { plugins: [createAppI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe("ExpandableText", () => {
  it("shows a text that fits with its line breaks and no button", async () => {
    layout(48, 48);
    const wrapper = await mountText("Talks\nPizza after");

    expect(wrapper.get("p").text()).toBe("Talks\nPizza after");
    expect(wrapper.get("p").classes()).toContain("whitespace-pre-line");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("expands a cut text and collapses it again", async () => {
    layout(200, 96);
    const wrapper = await mountText("A long description");
    const button = wrapper.get("button");

    expect(wrapper.get("p").classes()).toContain("line-clamp-4");
    expect(button.text()).toBe("Развернуть");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.attributes("aria-controls")).toBe(wrapper.get("p").attributes("id"));

    await button.trigger("click");
    expect(wrapper.get("p").classes()).not.toContain("line-clamp-4");
    expect(button.text()).toBe("Свернуть");
    expect(button.attributes("aria-expanded")).toBe("true");

    await button.trigger("click");
    expect(wrapper.get("p").classes()).toContain("line-clamp-4");
    expect(button.text()).toBe("Развернуть");
  });

  it("measures again when the text changes", async () => {
    layout(48, 48);
    const wrapper = await mountText("Talks");
    expect(wrapper.find("button").exists()).toBe(false);

    layout(200, 96);
    await wrapper.setProps({ text: "A description grown long" });

    expect(wrapper.get("button").text()).toBe("Развернуть");
  });

  it("renders nothing for an empty text", async () => {
    const wrapper = await mountText("");

    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
