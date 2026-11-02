type Listener = (event: Event) => void;

// EventSource for tests (jsdom has none): every opened stream is recorded, and the test drives it
// with `open`, `emit` and `fail`.
export function fakeEventSource() {
  const opened: FakeStream[] = [];

  class FakeStream {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;

    readyState: number = FakeStream.CONNECTING;
    private readonly listeners = new Map<string, Listener[]>();

    constructor(readonly url: string) {
      opened.push(this);
    }

    get closed() {
      return this.readyState === FakeStream.CLOSED;
    }

    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    close() {
      this.readyState = FakeStream.CLOSED;
    }

    // The response is 200 with the stream.
    open() {
      this.readyState = FakeStream.OPEN;
      this.dispatch(new Event("open"));
    }

    emit(type: string, data: unknown) {
      this.dispatch(new MessageEvent(type, { data: JSON.stringify(data) }));
    }

    // As the browser does: a dropped connection or an ended stream is reconnected by
    // EventSource itself (`closed: false`); a response other than 200 closes it for good.
    fail({ closed }: { closed: boolean }) {
      this.readyState = closed ? FakeStream.CLOSED : FakeStream.CONNECTING;
      this.dispatch(new Event("error"));
    }

    private dispatch(event: Event) {
      for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    }
  }

  return { EventSource: FakeStream, opened };
}
