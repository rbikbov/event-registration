# src/shared/api — network and errors

- `api` (openapi-fetch) + `unwrap()` — the only path to the backend. `unwrap` returns the data or
  throws an `AppError`; a network error — as `kind: "network"`.
  A response without a body (204) — `unwrapEmpty()`: `unwrap` would take the absence of data for
  `unknown`.
- `AppError.kind` is derived from the HTTP status in `app-error.ts` and only there. A new status or a
  new `kind` — a change of `kindForStatus` and a new case in `app-error.test.ts`.
- `csrf.ts` — a middleware: `X-CSRFToken` from the `csrftoken` cookie on all modifying requests;
  the pages do not set the header themselves.
- - A 400 carries `AppError.fields` — error codes by field (`{"errors": {field: [code]}}`); the form
    picks the texts by code in its `<i18n>`.
- Above this folder nobody reads `Response`, statuses and error texts — only `kind`.
- `schema.d.ts` is generated from `backend/openapi.yaml` (`make schema`) and not edited by hand;
  `make schema-check` compares it with the generation.
- Queries of specific entities are not put here: `queryOptions` live in `pages/<page>/api` (needed
  by one page) or in `entities/<x>/api` (needed by several slices).
- `fetch` is passed to the client as a function (`(r) => globalThis.fetch(r)`): otherwise
  openapi-fetch captures it at import, and MSW in tests does not intercept the requests.
- Tests — MSW: each test declares its own network through `server.use()`; a request without a
  handler fails the test.
