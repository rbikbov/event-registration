import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { CharCounter } from ".";

function counter(value: string, max: number) {
  return mount(CharCounter, { props: { value, max } }).get("p");
}

describe("CharCounter", () => {
  it("shows the length against the limit", () => {
    expect(counter("Meetup", 200).text()).toBe("6/200");
  });

  it("counts the text without the spaces around it, as the form sends it", () => {
    expect(counter("  Meetup \n", 200).text()).toBe("6/200");
  });

  it.each([
    ["at the limit", "a".repeat(5), false],
    ["over the limit", "a".repeat(6), true],
  ])("is red only over the limit: %s", (_, value, over) => {
    expect(counter(value, 5).classes("text-destructive")).toBe(over);
  });
});
