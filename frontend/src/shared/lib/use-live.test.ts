import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import type { LiveSource } from "./live-source";
import { useLive } from "./use-live";

// A source that records its subscriptions and lets the test push data to the open ones.
function fakeSource(name: string, log: string[]) {
  const listeners = new Set<(data: string) => void>();
  const source: LiveSource<string> = {
    subscribe(onData) {
      log.push(`open ${name}`);
      listeners.add(onData);
      return () => {
        log.push(`close ${name}`);
        listeners.delete(onData);
      };
    },
  };
  return { source, push: (data: string) => listeners.forEach((listener) => listener(data)) };
}

describe("useLive", () => {
  it("hands over the data of the source while its scope lives", () => {
    const log: string[] = [];
    const received: string[] = [];
    const a = fakeSource("a", log);
    const scope = effectScope();
    scope.run(() => useLive(a.source, (data) => received.push(data)));

    a.push("first");
    scope.stop();
    a.push("second");

    expect(received).toEqual(["first"]);
    expect(log).toEqual(["open a", "close a"]);
  });

  it("replaces the subscription when the source changes", async () => {
    const log: string[] = [];
    const current = ref(fakeSource("a", log).source);
    effectScope().run(() => useLive(current, () => {}));

    current.value = fakeSource("b", log).source;
    await nextTick();

    expect(log).toEqual(["open a", "close a", "open b"]);
  });

  it("subscribes only once there is a source", async () => {
    const log: string[] = [];
    const current = ref<LiveSource<string> | null>(null);
    effectScope().run(() => useLive(current, () => {}));
    await nextTick();

    expect(log).toEqual([]);
    current.value = fakeSource("a", log).source;
    await nextTick();

    expect(log).toEqual(["open a"]);
  });
});
