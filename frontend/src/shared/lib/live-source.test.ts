import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sseSource, type LiveState } from "./live-source";
import { fakeEventSource } from "./test/fake-event-source";

let streams: ReturnType<typeof fakeEventSource>;

beforeEach(() => {
  streams = fakeEventSource();
  vi.stubGlobal("EventSource", streams.EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it("reports a dropped stream as reconnecting until the next message", () => {
    const states: LiveState[] = [];
    sseSource("/api/stream/", "stats").subscribe(
      () => {},
      (state) => states.push(state),
    );
    const stream = streams.opened[0];
    stream?.open();
    stream?.emit("stats", { checked_in: 1 });

    // EventSource reconnects by itself; the counts are right again with the next message.
    stream?.fail({ closed: false });
    expect(states).toEqual(["reconnecting"]);
    stream?.open();
    expect(states).toEqual(["reconnecting"]);
    stream?.emit("stats", { checked_in: 2 });

    expect(states).toEqual(["reconnecting", "open"]);
    expect(streams.opened).toHaveLength(1);
  });

  it("opens a stream closed by a response other than 200 again after 3 s", () => {
    vi.useFakeTimers();
    const received: unknown[] = [];
    const states: LiveState[] = [];
    sseSource("/api/stream/", "stats").subscribe(
      (data) => received.push(data),
      (state) => states.push(state),
    );
    streams.opened[0]?.open();

    // A 502 of the gateway while the backend restarts: EventSource gives up on it.
    streams.opened[0]?.fail({ closed: true });
    vi.advanceTimersByTime(2999);
    expect(streams.opened).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(streams.opened.map((stream) => stream.url)).toEqual(["/api/stream/", "/api/stream/"]);
    // Again, and once more after it: the backend is still down.
    streams.opened[1]?.fail({ closed: true });
    vi.advanceTimersByTime(3000);
    streams.opened[2]?.open();
    streams.opened[2]?.emit("stats", { checked_in: 3 });

    expect(streams.opened).toHaveLength(3);
    // Each refusal is told: what refuses it may have changed (a session that ended).
    expect(states).toEqual(["reconnecting", "refused", "refused", "open"]);
    expect(received).toEqual([{ checked_in: 3 }]);
  });

  it("does not open again a stream that never opened", () => {
    vi.useFakeTimers();
    const states: LiveState[] = [];
    sseSource("/api/stream/", "stats").subscribe(
      () => {},
      (state) => states.push(state),
    );

    // 403 or 404: the page's GET tells which, a retry changes nothing.
    streams.opened[0]?.fail({ closed: true });
    vi.advanceTimersByTime(10_000);

    expect(streams.opened).toHaveLength(1);
    expect(states).toEqual([]);
  });

  it("does not open again after unsubscribing", () => {
    vi.useFakeTimers();
    const unsubscribe = sseSource("/api/stream/", "stats").subscribe(() => {});
    streams.opened[0]?.open();
    streams.opened[0]?.fail({ closed: true });

    unsubscribe();
    vi.advanceTimersByTime(3000);

    expect(streams.opened).toHaveLength(1);
  });

  it("closes the reopened stream when unsubscribed", () => {
    vi.useFakeTimers();
    const unsubscribe = sseSource("/api/stream/", "stats").subscribe(() => {});
    streams.opened[0]?.open();
    streams.opened[0]?.fail({ closed: true });
    vi.advanceTimersByTime(3000);

    unsubscribe();

    expect(streams.opened[1]?.closed).toBe(true);
  });
});
