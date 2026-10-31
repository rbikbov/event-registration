import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import { fakeEventSource } from "./test/fake-event-source";
import { useEventStream } from "./use-event-stream";

function run(url: () => string) {
  const fake = fakeEventSource();
  const received: unknown[] = [];
  const scope = effectScope();
  scope.run(() =>
    useEventStream(url, "stats", (data) => received.push(data), {
      EventSource: fake.EventSource,
    }),
  );
  return { ...fake, received, scope };
}

describe("useEventStream", () => {
  it("opens the stream and hands over the data of its named messages", () => {
    const { opened, received } = run(() => "/api/stream/");

    expect(opened.map((stream) => stream.url)).toEqual(["/api/stream/"]);
    opened[0]?.emit("stats", { checked_in: 1 });
    opened[0]?.emit("other", { checked_in: 2 });

    expect(received).toEqual([{ checked_in: 1 }]);
  });

  it("closes the stream when its scope is disposed", () => {
    const { opened, scope } = run(() => "/api/stream/");

    scope.stop();

    expect(opened[0]?.closed).toBe(true);
  });

  it("reopens the stream when the URL changes", async () => {
    const url = ref("/api/a/");
    const { opened } = run(() => url.value);

    url.value = "/api/b/";
    await nextTick();

    expect(opened.map((stream) => [stream.url, stream.closed])).toEqual([
      ["/api/a/", true],
      ["/api/b/", false],
    ]);
  });
});
