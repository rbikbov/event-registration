# Realtime (SSE): spec

Phase — `docs/roadmap.md`, phase 4. Status: approved 2026-10-31.

## What and why

Covers from `docs/task.md` (quotes translated from Russian) "the organizer's arrived counter updates live" and the general
requirement "works with two clients open at the same time". A transaction that changes the event's
counters sends `pg_notify`; the backend process listens to the channel and sends the SSE
subscribers a snapshot — the event with its counters, as in its `GET`. Locally the frontend is the
Vite dev server, and e2e goes through the build behind nginx with default buffering, like a proxy
in production. The starting point is "Realtime" and "Processes" in `docs/architecture.md`; the
differences — "Assumptions", items 3 and 4.

## Non-Goals

- A live public event list (`/`), a live ticket page (the place on the waitlist): by the criteria
  — the organizer's panel and the event page (the check-in screen is part of the panel since
  stage 3).
- Fallback polling (decision of 2026-10-28 21:04), WebSocket, Redis and another broker.
- Several backend processes and load balancing: there is one process, a listener per process.
- A production frontend build beyond the gateway in compose: TLS, cache headers, CDN.
- The gateway in `make up` and `stack-up`: locally it is still the Vite dev server, the gateway is
  for e2e only.
- e2e through the Vite dev server: its stream is checked in the browser during the stage pass.
- Checking permissions in an already open stream: permissions are checked on connection.
- Virtualizing the participant table: paged output (decision of 2026-10-31 16:16).
- More than 6 organizer tabs (the HTTP/1.1 connection limit per address): 2–3 are enough.

## Data model

No changes and no migrations. The channel is `event_stats`, the payload is `event_id` as a string.

## Invariants

| Invariant                                                            | What protects it                                                                                                                                                                           | Test                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| a subscriber does not see the counters of an uncommitted transaction | `pg_notify` in the same transaction as the change: Postgres delivers the notification only after the commit, a rollback cancels it                                                         | pytest, `transaction=True`: no notification after a rollback                                    |
| after (re)connection the counters are correct                        | the stream's first message is a snapshot from the database read after subscribing to notifications: a change between the snapshot and the subscription gives one more snapshot, not a loss | pytest: the first message is a snapshot; a change after connection — a new snapshot             |
| a missed notification does not distort the counters                  | the full snapshot goes over the network, not a delta; the subscriber's queue holds one pending event: the snapshot is read from the database anyway                                        | pytest: two changes in a row → the last snapshot is correct                                     |
| changes that do not change the counters send no notification         | `pg_notify` only where the row changed: a new and a revived registration, a cancellation, a promotion, the first check-in                                                                  | pytest: a repeated registration, a repeated cancellation, a repeated check-in — no notification |

## API

| Method and path                                         | Input   | Response                                                                                     | Errors (status → `kind`)                                   |
| ------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/org/events/{id}/stream/`                      | session | 200 `text/event-stream`: `event: snapshot`, `data` — the body of `GET /api/org/events/{id}/` | 401 (no session); 403 (an event of another organizer); 404 |
| `GET /api/events/{id}/stream/`                          | —       | 200 `text/event-stream`: `event: snapshot`, `data` — the body of `GET /api/events/{id}/`     | 404                                                        |
| `GET /api/org/events/{id}/registrations/?status=&page=` | session | 200 — up to 50 registrations of page `page` (from 1) in queue order; past the end — `[]`     | 400 (`page` < 1 or > 1,000,000); 401; 403; 404             |

- The stream: `retry: 3000`, a snapshot right away, then a snapshot on each notification of the
  event and a `: ping` comment every 15 s without changes. Headers: `Cache-Control: no-cache`,
  `X-Accel-Buffering: no`; no compression.
- The snapshot — `Event.objects.with_registration_counts()`, one query; its shape — the serializers
  of the `GET` of the same events (`OrgEventSerializer`, `PublicEventSerializer`): the page takes
  the whole event from the stream. The organizer's event also has `cancelled`: from the counters
  the panel computes the pages of any filter. No snapshot has participants (names, emails).
- In `openapi.yaml`: `extend_schema(responses={(200, "text/event-stream"): <Serializer>})`; the
  schema describes the `data` of one message, the stream format is in `description`. The snapshot
  type on the frontend is generated into `schema.d.ts`. The change follows the `api-change`
  procedure.

## Backend

- `pg_notify('event_stats', event_id)` — in `register` (a new and a revived one), `cancel` (together
  with a promotion — one notification: Postgres merges identical ones in one transaction),
  `check_in` (only the first check-in).
- The listener: one async psycopg connection per process (`LISTEN event_stats`), started with the
  first subscriber and closed after the last one leaves. On an event's notification it reads a
  snapshot and puts it into the subscribers' `asyncio.Queue(maxsize=1)`: a new snapshot replaces an
  unsent one. A break of the listener's connection closes all streams of the process: clients
  reconnect and get a snapshot, the listener starts again.
- A snapshot is read once per event and notification and handed to all subscribers of the process
  (stage 3): N viewers — one query, not N, and the streams do not hold a database connection. The
  shared snapshot is for subscribers with the same snapshot function (organizer or public). A
  subscriber's first snapshot is also read by the feed; the reads go one after another and are
  handed to those who subscribed before the read started — a subscriber's snapshots never go back.
  A read error closes the streams of that snapshot.
- View: permissions (`get_org_event`), 401/403/404 and the error format — as in the other
  endpoints. The response is a `StreamingHttpResponse` with an async generator. An open stream
  holds an OS thread (measured: 20 SSE streams — 20 OS threads) — a deliberate limit,
  "Assumptions", item 1. A client disconnect cancels the generator, the subscription is removed in
  `finally`. Stream tests use `AsyncClient`: the synchronous client will not read an async
  generator to the end.
- `EventSource` sends `Accept: text/event-stream`, and DRF's renderer is JSON only (406): the view
  has its own `content_negotiation_class` that always picks JSON. Errors go out as JSON, a
  successful response is a stream past the renderer.

## Gateway

A model of a hypothetical production — for e2e only. One `frontend` service and one port
(5173 + slot), the mode is the `frontend/Dockerfile` stage: `build.target: ${FRONTEND_TARGET:-dev}`.

- `dev` — the Vite dev server, as now: `make up`, `stack-up`.
- `gateway` — `vite build` and nginx on the same port inside the container: serves `dist/` (an
  unknown path gets `index.html`), proxies `/api`, `/admin`, `/static` to the backend with the
  client's `Host`. Proxy buffering is the default (on); no compression. `make e2e`, `stack-e2e` and
  CI set `FRONTEND_TARGET=gateway`; `up --build` recreates the container, both stages come from the
  cache.
- The port, the healthcheck and `FRONTEND_URL` in emails are the same in both modes: links from
  emails in e2e lead to the same place as `baseURL`. On the human's slot `make e2e` replaces the
  running `make up` with the build, the next `make up` brings Vite back.

## UI

- **The event panel**: the event is read with one `GET` (it gives 403/404 — `EventSource` does not
  return the status), then the stream is opened, and a snapshot replaces the event in the
  `orgEventQuery(id)` cache. The panel has no background refetches of the event: a `GET` that read
  the event before a snapshot would answer after it with old counters; a cache from a previous
  visit is updated by the first snapshot. Before stage 3 a snapshot cancelled a `GET` of the same
  key from the check-in screen; in the layout the event has one reader, and the cancellation is not
  needed. Since stage 3 the event is the `/org/events/:id` layout: the request, the stream, the
  header, 403/404; the participants and check-in are child routes, the event is a prop for the
  participants (the check-in form needs only the id). The participant table — 50 per page, the
  number of pages of the filter comes from the snapshot's counters. The table itself is not
  re-read: a snapshot with counters other than those the page was loaded with shows "There are
  updates — refresh". A break — "Connection lost, reconnecting…" above the counters; it disappears
  with the next snapshot.
- **The event page**: the same — one `GET`, then snapshots from the stream; no indicator.
- `shared/lib`: `LiveSource` — data the server sends, not tied to a transport (`subscribe(onData)`
  → unsubscribe); `sseSource(url, event)` — an implementation on `EventSource`;
  `useLive(source, onData)` — a subscription for the component's lifetime. The entity provides the
  `LiveSource` (`orgEventLive(id)`), the page does not know about SSE. The
  `open | reconnecting | refused` state — stage 4.

## Edge cases

- A non-200 response — including on the first connection: `EventSource` closes, does not reconnect
  by itself and does not return the status. The composable reports the refusal and opens the stream
  again after 3 s; the indicator stays. On each refusal the page re-reads the event as a probe — a
  `GET` under its own key, the answer is not written into the event cache and does not overwrite
  the snapshot: 401 — `/login` (`app/session-expiry`, as on a 401 of any request); 403/404 — the
  stream is closed, the page shows the answer, as on loading; 200, 502 or no network — a retry
  after 3 s.
- Two tabs of one organizer — two independent streams, both get the snapshot.
- A backend restart with open streams: uvicorn waits for them for no more than a few seconds
  (`--timeout-graceful-shutdown`), otherwise `docker compose restart` hangs until the timeout.

## Assumptions and open questions

1. The streams are in `openapi.yaml` with the permissions and errors of the rest of the API (the
   human's decision) and stay synchronous views: an OS thread per open stream is the limit of one
   process (decision of 2026-10-31 21:04). Estimated for 10 events of 100 participants: up to ~1050
   threads in the worst case, 200–300 in reality. An async view does not remove the thread: it is
   started by Django's request context under ASGI at the first `sync_to_async` (WhiteNoise, the
   session, the snapshot). The bottleneck is Postgres connections, and the shared snapshot removes
   it. Thousands of connections or several processes — a separate push server (Centrifugo), in
   "what's next" of the README.
2. The indicator is only for the organizer, as in `architecture.md`: for a participant it is enough
   that the number of seats updates after reconnecting.
3. **A difference from `architecture.md`** (confirmed by the human): there it is
   `proxy_buffering off`, here buffering is on, and the backend sends `X-Accel-Buffering: no` —
   any nginx understands it. Measured (2026-10-31): nginx 1.30 buffering alone does not delay the
   stream — snapshots go right away even without the header; what delays them is buffering
   together with gzip for `text/event-stream`, and the header fixes that. The header is always
   needed, especially if compression is turned on in the proxy; e2e does not catch its absence (the
   gateway has no gzip). The read timeout of 60 s > the heartbeat of 15 s.
4. **A difference from `architecture.md`:** there the gateway is the entry of `make up`; here (the
   human's decision) locally it is Vite, e2e — the build behind nginx on the same port.
5. The stream is opened only after a successful `GET`, so the first refusal is a 502 or a 401 just
   like the following ones, and is handled the same way (a probe, the "Edge cases" item).

## Acceptance scenarios

| Scenario                                                                                                                      | Test level       |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Given a registration / a cancellation with a promotion / the first check-in When committed Then one notification of the event | pytest, Postgres |
| Given a rolled-back transaction or a repeat without changes Then no notification                                              | pytest, Postgres |
| Given a connection to the stream Then the first message is a snapshot; after a check-in — a new snapshot                      | pytest           |
| Given a stream of someone else's event Then 403; without a session Then 401; an unknown event Then 404                        | pytest           |
| Given a snapshot with other counters When the panel is open Then the counters are new, "There are updates"                    | Vitest           |
| Given a break / a 502 response When a retry succeeded Then the indicator is gone, the counters come from the snapshot         | Vitest           |
| Given two tabs through the gateway When a check-in in the first Then "Arrived" changes in the second                          | e2e              |
| Given a registration in one tab Then "free seats" changes on the event page in the other                                      | e2e              |
| Given the stream is broken (`page.route`) When restored Then the indicator is gone, the counter is correct                    | e2e              |
