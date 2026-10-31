import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sseSource } from "./live-source";
import { fakeEventSource } from "./test/fake-event-source";

let streams: ReturnType<typeof fakeEventSource>;

beforeEach(() => {
  streams = fakeEventSource();
  vi.stubGlobal("EventSource", streams.EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sseSource", () => {
  it("opens the stream and hands over the data of its named messages", () => {
    const received: unknown[] = [];

    sseSource("/api/stream/", "stats").subscribe((data) => received.push(data));
    streams.opened[0]?.emit("stats", { checked_in: 1 });
    streams.opened[0]?.emit("other", { checked_in: 2 });

    expect(streams.opened.map((stream) => stream.url)).toEqual(["/api/stream/"]);
    expect(received).toEqual([{ checked_in: 1 }]);
  });

  it("closes the stream when unsubscribed", () => {
    const unsubscribe = sseSource("/api/stream/", "stats").subscribe(() => {});

    unsubscribe();

    expect(streams.opened[0]?.closed).toBe(true);
  });
});
