import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import HomePage from "./HomePage.vue";

describe("HomePage", () => {
  it("links to the login, organizer and health pages", () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });

    const wrapper = mount(HomePage, { global: { plugins: [router] } });

    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toEqual(["/login", "/org/events", "/health"]);
  });
});
