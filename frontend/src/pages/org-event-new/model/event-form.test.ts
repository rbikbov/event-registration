import { describe, expect, it } from "vitest";

import { parseEventForm, serverFormErrors, type EventFormInput } from "./event-form";

const now = new Date("2030-01-01T00:00:00Z");

function input(overrides: Partial<EventFormInput> = {}): EventFormInput {
  return {
    title: "Meetup",
    description: "",
    starts_at: "2030-05-01T18:00",
    capacity: "30",
    ...overrides,
  };
}

describe("parseEventForm", () => {
  it("returns values ready to send: trimmed title, ISO start, numeric capacity", () => {
    const result = parseEventForm(input({ title: "  Meetup  " }), now);

    expect(result).toEqual({
      ok: true,
      values: {
        title: "Meetup",
        description: "",
        starts_at: new Date("2030-05-01T18:00").toISOString(),
        capacity: 30,
      },
    });
  });

  it.each([
    [{ title: "   " }, "title", "blank"],
    [{ title: "x".repeat(201) }, "title", "max_length"],
    [{ description: "x".repeat(2001) }, "description", "max_length"],
    [{ starts_at: "" }, "starts_at", "required"],
    [{ starts_at: "garbage" }, "starts_at", "invalid"],
    [{ starts_at: "2029-12-31T10:00" }, "starts_at", "past"],
    [{ capacity: "" }, "capacity", "required"],
    [{ capacity: "many" }, "capacity", "invalid"],
    [{ capacity: "2.5" }, "capacity", "invalid"],
    [{ capacity: "0" }, "capacity", "min_value"],
    [{ capacity: "10001" }, "capacity", "max_value"],
  ] as const)("rejects %j", (overrides, field, code) => {
    const result = parseEventForm(input(overrides), now);

    expect(result).toEqual({ ok: false, errors: { [field]: code } });
  });
});

describe("serverFormErrors", () => {
  it("takes the first code of each known field", () => {
    expect(serverFormErrors({ capacity: ["min_value", "invalid"], starts_at: ["past"] })).toEqual({
      capacity: "min_value",
      starts_at: "past",
    });
  });

  it("reads an unknown code as invalid and ignores unknown fields", () => {
    expect(serverFormErrors({ title: ["weird"], other: ["blank"] })).toEqual({ title: "invalid" });
  });

  it("gives nothing without fields", () => {
    expect(serverFormErrors(undefined)).toEqual({});
  });
});
