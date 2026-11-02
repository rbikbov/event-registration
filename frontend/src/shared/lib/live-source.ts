// Whether the data delivered is current: "reconnecting" from a lost connection until the first
// data after it. "refused" — the server declined a reconnection, which is tried again later; it
// comes on each refusal, while reconnecting.
export type LiveState = "open" | "reconnecting" | "refused";

// Data the server pushes, whatever carries it: pages and entities depend on this, not on SSE,
// so the transport can change (WebSocket, long polling) behind it.
export interface LiveSource<Data> {
  // Starts delivering to `onData` and the changes of its state to `onState`; the returned
  // function stops it.
  subscribe(onData: (data: Data) => void, onState?: (state: LiveState) => void): () => void;
}

// What the server sends as `retry`: the same pause for a stream EventSource gave up on.
const REOPEN_MS = 3000;

// Server-sent events of `url`: the JSON data of each `event` message.
//
// A dropped connection EventSource reconnects by itself. A response other than 200 closes it for
// good, and EventSource does not tell which one: a 502 of the gateway while the backend restarts,
// or a 401, 403, 404 a retry cannot change. So each refusal is told as "refused", and the stream
// is opened again after 3 s, until the subscriber, having asked the server why, unsubscribes.
export function sseSource<Data>(url: string, event: string): LiveSource<Data> {
  return {
    subscribe(onData, onState = () => {}) {
      let source: EventSource;
      let reconnecting = false;
      let reopening: ReturnType<typeof setTimeout> | undefined;

      function lost() {
        if (reconnecting) return;
        reconnecting = true;
        onState("reconnecting");
      }

      function open() {
        source = new EventSource(url);
        // The server's contract: the data of a message is the JSON of the schema type.
        source.addEventListener(event, (message: MessageEvent<string>) => {
          onData(JSON.parse(message.data) as Data);
          // Not on `open`: the counts are right again with the snapshot that follows it.
          if (reconnecting) {
            reconnecting = false;
            onState("open");
          }
        });
        source.addEventListener("error", () => {
          lost();
          if (source.readyState === EventSource.CLOSED) {
            onState("refused");
            reopening = setTimeout(open, REOPEN_MS);
          }
        });
      }

      open();
      return () => {
        clearTimeout(reopening);
        source.close();
      };
    },
  };
}
