import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import type { LiveSource, LiveState } from "./live-source";
import { useLive } from "./use-live";

// A source that records its subscriptions and lets the test push data and states to the open
// ones.
function fakeSource(name: string, log: string[]) {
  const listeners = new Set<(data: string) => void>();
  const stateListeners = new Set<(state: LiveState) => void>();
  const source: LiveSource<string> = {
    subscribe(onData, onState = () => {}) {
      log.push(`open ${name}`);
      listeners.add(onData);
      stateListeners.add(onState);
      return () => {
        log.push(`close ${name}`);
        listeners.delete(onData);
        stateListeners.delete(onState);
      };
    },
  };
  return {
    source,
    push: (data: string) => listeners.forEach((listener) => listener(data)),
    state: (state: LiveState) => stateListeners.forEach((listener) => listener(state)),
  };
}

// What the browser fires when it puts the page into the back/forward cache and takes it out.
function pageTransition(type: "pagehide" | "pageshow", persisted: boolean) {
  window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
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

  it("tells whether the source is reconnecting", () => {
    const a = fakeSource("a", []);
    const live = effectScope().run(() => useLive(a.source, () => {}));

    expect(live?.reconnecting.value).toBe(false);
    a.state("reconnecting");
    expect(live?.reconnecting.value).toBe(true);
    a.state("open");
    expect(live?.reconnecting.value).toBe(false);
  });

  it("tells each refusal of the source, as reconnecting", () => {
    const a = fakeSource("a", []);
    let refusals = 0;
    const live = effectScope().run(() =>
      useLive(a.source, () => {}, { onRefused: () => (refusals += 1) }),
    );

    a.state("reconnecting");
    a.state("refused");
    a.state("refused");

    expect(refusals).toBe(2);
    expect(live?.reconnecting.value).toBe(true);
  });

  it("does not keep the reconnecting of a source it left", async () => {
    const log: string[] = [];
    const a = fakeSource("a", log);
    const current = ref(a.source);
    const live = effectScope().run(() => useLive(current, () => {}));
    a.state("reconnecting");

    current.value = fakeSource("b", log).source;
    await nextTick();

    expect(live?.reconnecting.value).toBe(false);
  });

  it("subscribes again when the page comes back from the back/forward cache", async () => {
    const log: string[] = [];
    const a = fakeSource("a", log);
    const received: string[] = [];
    const scope = effectScope();
    scope.run(() => useLive(a.source, (data) => received.push(data)));

    // The cached page has its stream closed, and nothing reads the event again but the stream.
    pageTransition("pagehide", true);
    await nextTick();
    pageTransition("pageshow", true);
    await nextTick();
    a.push("after");
    scope.stop();

    expect(log).toEqual(["open a", "close a", "open a", "close a"]);
    expect(received).toEqual(["after"]);
  });

  it("keeps the subscription through a page transition outside the cache", async () => {
    const log: string[] = [];
    effectScope().run(() => useLive(fakeSource("a", log).source, () => {}));

    // The first show of a page, and a hide of one that is unloaded: nothing to restore.
    pageTransition("pageshow", false);
    pageTransition("pagehide", false);
    await nextTick();

    expect(log).toEqual(["open a"]);
  });
});
