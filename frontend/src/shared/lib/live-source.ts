// Data the server pushes, whatever carries it: pages and entities depend on this, not on SSE,
// so the transport can change (WebSocket, long polling) behind it.
export interface LiveSource<Data> {
  // Starts delivering to `onData`; the returned function stops it.
  subscribe(onData: (data: Data) => void): () => void;
}

// Server-sent events of `url`: the JSON data of each `event` message.
export function sseSource<Data>(url: string, event: string): LiveSource<Data> {
  return {
    subscribe(onData) {
      const source = new EventSource(url);
      // The server's contract: the data of a message is the JSON of the schema type.
      source.addEventListener(event, (message: MessageEvent<string>) =>
        onData(JSON.parse(message.data) as Data),
      );
      return () => source.close();
    },
  };
}
