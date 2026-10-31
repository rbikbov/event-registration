type Listener = (event: MessageEvent<string>) => void;

// EventSource for tests (jsdom has none): every opened stream is recorded, and the test sends
// its messages with `emit`.
export function fakeEventSource() {
  const opened: FakeStream[] = [];

  class FakeStream {
    closed = false;
    private readonly listeners = new Map<string, Listener[]>();

    constructor(readonly url: string) {
      opened.push(this);
    }

    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    close() {
      this.closed = true;
    }

    emit(type: string, data: unknown) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }

  return { EventSource: FakeStream, opened };
}
