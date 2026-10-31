import { toValue, watch, type MaybeRefOrGetter } from "vue";

// What the composable uses of EventSource: the browser one fits, a test passes a fake.
interface StreamSource {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

interface EventStreamDeps {
  EventSource: new (url: string) => StreamSource;
}

// Server-sent events of `url`: the JSON data of each `event` message goes to `onData`.
// The stream is reopened when the URL changes and closed with the calling component.
export function useEventStream<Data>(
  url: MaybeRefOrGetter<string>,
  event: string,
  onData: (data: Data) => void,
  deps: EventStreamDeps = { EventSource: globalThis.EventSource },
) {
  watch(
    () => toValue(url),
    (current, _previous, onCleanup) => {
      const source = new deps.EventSource(current);
      // The server's contract: the data of a message is the JSON of the schema type.
      source.addEventListener(event, (message) => onData(JSON.parse(message.data) as Data));
      onCleanup(() => source.close());
    },
    { immediate: true },
  );
}
