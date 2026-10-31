import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { CardHeading } from ".";

describe("CardHeading", () => {
  it.each([1, 2, 3] as const)("renders an h%i with the card title look", (level) => {
    const wrapper = mount(CardHeading, {
      props: { level, class: "text-2xl" },
      slots: { default: "Meetup" },
    });

    const heading = wrapper.get(`h${level}`);
    expect(heading.text()).toBe("Meetup");
    expect(heading.classes()).toEqual(expect.arrayContaining(["font-semibold", "text-2xl"]));
  });
});
