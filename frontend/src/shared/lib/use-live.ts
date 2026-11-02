import { useEventListener } from "@vueuse/core";
import { readonly, ref, toValue, watch, type MaybeRefOrGetter } from "vue";

import type { LiveSource } from "./live-source";

// Subscribes to `source` for as long as the calling component lives; a new source (another
// event) replaces the subscription, and null means none yet. `reconnecting` is true from a lost
// connection until data comes again; `onRefused` is called on each refusal of a reconnection.
//
// A page put into the back/forward cache has its stream closed by the browser and comes back
// with the data it had, which nothing reads again but the stream: so the subscription ends on
// leaving it and starts anew, with a fresh first message, on coming back.
export function useLive<Data>(
  source: MaybeRefOrGetter<LiveSource<Data> | null>,
  onData: (data: Data) => void,
  { onRefused = () => {} }: { onRefused?: () => void } = {},
) {
  const reconnecting = ref(false);
  const cached = ref(false);
  useEventListener(window, "pagehide", (event) => {
    if (event.persisted) cached.value = true;
  });
  useEventListener(window, "pageshow", (event) => {
    if (event.persisted) cached.value = false;
  });

  watch(
    () => (cached.value ? null : toValue(source)),
    (current, _previous, onCleanup) => {
      reconnecting.value = false;
      if (!current) return;
      onCleanup(
        current.subscribe(onData, (state) => {
          reconnecting.value = state !== "open";
          if (state === "refused") onRefused();
        }),
      );
    },
    { immediate: true },
  );

  return { reconnecting: readonly(reconnecting) };
}
