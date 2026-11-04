import { describe, expect, it } from "vitest";

import { eventPageCount } from "./event-pages";

describe("eventPageCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [41, 3],
  ])("%i events take %i pages", (count, pages) => {
    expect(eventPageCount(count)).toBe(pages);
  });
});
