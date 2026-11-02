import { describe, expect, it } from "vitest";

import {
  changedFields,
  eventFormInput,
  parseEventChanges,
  parseEventForm,
  serverFormErrors,
  type EventFormInput,
} from "./event-form";
import { localInputValue } from "./local-input";

const now = new Date("2030-01-01T00:00:00Z");

function input(overrides: Partial<EventFormInput> = {}): EventFormInput {
  return {
    title: "Meetup",
    description: "",
    starts_at: "2030-05-01T18:00",
    capacity: 30,
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
    [{ capacity: undefined }, "capacity", "required"],
    [{ capacity: Number.NaN }, "capacity", "invalid"],
    [{ capacity: 2.5 }, "capacity", "invalid"],
    [{ capacity: 0 }, "capacity", "min_value"],
    [{ capacity: 10001 }, "capacity", "max_value"],
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

  it("knows below_confirmed of the capacity", () => {
    expect(serverFormErrors({ capacity: ["below_confirmed"] })).toEqual({
      capacity: "below_confirmed",
    });
  });

  it("reads an unknown code as invalid and ignores unknown fields", () => {
    expect(serverFormErrors({ title: ["weird"], other: ["blank"] })).toEqual({ title: "invalid" });
  });

  it("gives nothing without fields", () => {
    expect(serverFormErrors(undefined)).toEqual({});
  });
});

describe("eventFormInput", () => {
  it("fills the form with the event as datetime-local and the number field read it", () => {
    const form = eventFormInput({
      title: "Meetup",
      description: "Talks",
      starts_at: "2030-05-01T18:00:00Z",
      capacity: 30,
    });

    expect(form).toEqual({
      title: "Meetup",
      description: "Talks",
      starts_at: localInputValue("2030-05-01T18:00:00Z"),
      capacity: 30,
    });
  });
});

describe("changedFields", () => {
  const initial = input();

  it("is empty for the initial values, and for a title that differs only in spaces", () => {
    expect(changedFields(initial, initial)).toEqual([]);
    expect(changedFields(input({ title: " Meetup " }), initial)).toEqual([]);
  });

  it("lists every field that differs, in form order", () => {
    const edited = input({ capacity: 40, title: "Renamed", starts_at: "2030-05-02T18:00" });

    expect(changedFields(edited, initial)).toEqual(["title", "starts_at", "capacity"]);
  });
});

describe("parseEventChanges", () => {
  const initial = input();

  it("returns only the changed fields, ready to send", () => {
    const result = parseEventChanges(input({ title: " Renamed ", capacity: 40 }), initial, now);

    expect(result).toEqual({ ok: true, changes: { title: "Renamed", capacity: 40 } });
  });

  it("sends the new start as ISO", () => {
    const result = parseEventChanges(input({ starts_at: "2030-05-02T18:00" }), initial, now);

    expect(result).toEqual({
      ok: true,
      changes: { starts_at: new Date("2030-05-02T18:00").toISOString() },
    });
  });

  it("keeps an unchanged start that is already past: the event may be under way", () => {
    const started = input({ starts_at: "2029-12-31T10:00" });

    const result = parseEventChanges({ ...started, title: "Renamed" }, started, now);

    expect(result).toEqual({ ok: true, changes: { title: "Renamed" } });
  });

  it("rejects a changed start in the past", () => {
    const result = parseEventChanges(input({ starts_at: "2029-12-31T10:00" }), initial, now);

    expect(result).toEqual({ ok: false, errors: { starts_at: "past" } });
  });

  it("checks every field as creation does", () => {
    const result = parseEventChanges(input({ title: " ", capacity: 0 }), initial, now);

    expect(result).toEqual({ ok: false, errors: { title: "blank", capacity: "min_value" } });
  });
});
