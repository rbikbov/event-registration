# frontend/ — Vue 3 + Vite

Commands and tools — `docs/development.md`, the "Frontend" section. How to write the code (layers,
DI, state, tests) — the `fsd-frontend` skill. Here — the rules that always apply.

## Map

```text
src/main.ts          the entry point: mountApp("#app")
src/app/             the application: App.vue, router.ts, query-client.ts; ui/AppLayout — the header (by meQuery, logout), the "No internet connection" bar and the shared <main>
src/pages/<page>/    screens: ui/, api/ (queries needed only by the page), index.ts; not-found — the `routes.notFound` route, the last one
src/pages/org-event/ the organizer's event layout: the query, the stream, the header, the tabs —
                     org-event-participants, org-checkin and org-event-edit (child routes)
src/entities/session/ who is logged in: meQuery (null — a guest), logout, forgetUserData — dropping the previous user's data on login and logout
src/entities/event/  events: orgEventsQuery / orgEventQuery(id) / orgEventLive(id) / orgEventProbe(id) (organizer), publicEventsQuery / publicEventQuery(id) / publicEventLive(id) / publicEventProbe(id) (public); a probe — the event's status after a stream refusal, without writing into its cache; the event form model (creation and editing) — `model/event-form.ts`; lists — by period and page (`orgEventsQuery(period, page)`, `publicEventsQuery(period, page)`), after events change all pages are invalidated — `orgEventListsKey` / `publicEventListsKey`, the number of pages — `eventPageCount(count)`; the list period — `periodFromQuery` (`?period=past`, otherwise upcoming)
src/shared/api/      the API client, AppError, unwrap, the generated schema.d.ts. Rules: src/shared/api/AGENTS.md
src/shared/ui/       hand-written components (query-state — the loading and errors of a query, on the first error — a link to `/health`, `RetryAlert` — an error with a retry; error-state — `ErrorState` in place of the page and `NotFound` on top of it; expandable-text — text up to 4 lines with "Expand"; nav-link — a header and tab link, the current page is highlighted and has `aria-current`; char-counter — "12/200" under a field with a limit; filter-link — a list filter in the address (status, period), the selected one is highlighted and has `aria-current`; page-nav — list pages: first, previous, the numbers next to the current one, next, last, the number is in the address); ui/shadcn/ — generated shadcn-vue, not edited by hand
src/shared/config/   routes — all application paths
src/shared/lib/      utilities; safe-next — the login's `?next=`, only a path of this application; page-query — `pageFromQuery`, the page number from `?page=`; moment-format — `formatMoment`, the check-in time: with a date if not today; live-source (`LiveSource` — data from the server, `sseSource` — over SSE) and use-live — a subscription for the component's lifetime; lib/test/ — MSW, a fake EventSource, `goOnline` (the browser's network) and the setup for Vitest
src/widgets|features/            appear with their first slice, not created empty
```

## Rules

1. Imports go only to lower layers; into another slice — only through its `index.ts`. ESLint checks
   it (`boundaries/dependencies`); do not disable or bypass the rule.
2. Network — only through `api` and `unwrap()` from `@/shared/api`. Above `shared/api` there is no
   `fetch`, `Response` and HTTP statuses: only data and `AppError.kind`.
3. API types are not written by hand — they come from `schema.d.ts` (`make schema`). A response type
   is needed — `components["schemas"]["<Name>"]`.
4. Each async action in the UI shows loading, an error and an empty state and blocks a repeated
   submit.
   The data of a query on a page is rendered through `QueryState` (`shared/ui/query-state`), not by a
   `v-if="isPending"` / `v-else-if="isError"` / `v-else-if="data"` chain. On a failed background
   refresh (window focus, `invalidateQueries`) TanStack Query sets `isError` but keeps `data`: an
   error branch before the data branch hides what is already loaded. The error is in place of the
   data only if there is no data; otherwise — an alert above the previous data. Answers a retry does
   not change (`not_found`, `forbidden`) are shown by the page before `QueryState`. A test of a page
   with a query also checks a failed `refetchQueries()` after the load.
   The exception is the organizer's event layout (`pages/org-event`): it keeps only the header in
   `QueryState`: the check-in form works without the event too (the title is only a caption), so the
   "Check-in" tab is outside `QueryState` and visible on an event loading error. Until the `GET`
   answers there are no tabs: the event may turn out to be someone else's.
5. The interface texts are in two `<i18n lang="json">` blocks of the same component —
   `locale="en"` (shown) and `locale="ru"` (kept for a later language switch, the fallback) with the
   same keys (`src/app/i18n-blocks.test.ts`), obtained through `useI18n({ useScope: "local" })`; stores and pure functions have no
   texts (they return codes, the component picks the text). There are no global messages. The `@`
   character in a message is written as `{'@'}`, otherwise the build fails.
6. Names: components — `PascalCase.vue`, other files — `kebab-case.ts`, a composable —
   `use-<what>.ts` with a `use<What>` function. A test — next to it: `<file>.test.ts`.
7. No `any`, `@ts-ignore`, `as unknown as`, empty `catch`, `console.log`. Each promise — `await` or
   `void` with error handling inside.
8. Tests: network — only MSW (`server.use()` in each test), our own modules are not mocked through
   `vi.mock` — dependencies are passed explicitly (the `fsd-frontend` skill, the section on DI).
9. A component from `shared/ui/shadcn/` is not edited: a different look is needed — a wrapper in
   `shared/ui/` or tokens in `app/styles.css`. A new one — `pnpm dlx shadcn-vue@latest add <name>`,
   only with a consumer.
   A card heading — `CardHeading` with `level` (`shared/ui/card-heading`), not `CardTitle`: that one
   is always `h3` and silently ignores `as`.
10. Route paths — only from `routes` (`@/shared/config`): they are not written as a `"/..."` string
    in the router, in `router.push`/`RouterLink` or in tests.
