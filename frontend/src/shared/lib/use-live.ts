import { toValue, watch, type MaybeRefOrGetter } from "vue";

import type { LiveSource } from "./live-source";

// Subscribes to `source` for as long as the calling component lives; a new source (another
// event) replaces the subscription, and null means none yet.
export function useLive<Data>(
  source: MaybeRefOrGetter<LiveSource<Data> | null>,
  onData: (data: Data) => void,
) {
  watch(
    () => toValue(source),
    (current, _previous, onCleanup) => {
      if (current) onCleanup(current.subscribe(onData));
    },
    { immediate: true },
  );
}
