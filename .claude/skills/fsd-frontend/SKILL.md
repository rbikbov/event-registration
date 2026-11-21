---
name: fsd-frontend
description: >
  How to write frontend code on Vue 3 + TypeScript by Feature-Sliced Design: which layer and slice
  to put the code in, how to connect two slices without a cross import (props, slots,
  provide/inject, a factory with dependencies), how to work with server data and state, errors and
  async, tests. Use when writing or refactoring a page, a feature, an entity, a composable, a
  component and when reviewing frontend code.
---

# Frontend on Vue 3 + FSD

A shortened adaptation of the `fsd-frontend` skill from the `rbikbov/frontend-starter` template
(React there). The principles are the same, the mechanisms are Vue's. The rules that always apply are
in `frontend/AGENTS.md`; on a divergence they take precedence over this document.

**MUST** — do not break; **SHOULD** — yes by default, a deviation — with a reason in the code.

## 1. What good code is here

1. **Locality of changes:** a change of one scenario touches one slice.
2. **Testable without the world:** logic can be checked without the network, the router and the
   whole component tree — by substituting fake dependencies.
3. **Explicit dependencies:** a module's signature shows everything it needs.
4. **Loud errors:** a wrong assembly (no provide, a broken boundary) fails right away, errors are
   not swallowed.
5. **Minimum abstractions:** an abstraction appears with a second consumer or a test that needs it.

## 2. Layers

```text
app/       initialization: App.vue, the router, QueryClient, global services
pages/     a whole screen: a composition of slices + logic needed only by it
widgets/   reusable large blocks — not created, the composition lives in pages
features/  reusable user scenarios (a verb: register-for-event, check-in)
entities/  reusable business entities (a noun: event, registration)
shared/    infrastructure without business rules: api, lib, ui, config
```

MUST: imports go only down; between slices of one layer — not allowed; from outside a slice — only
its `index.ts`; `shared` has no business rules ("the waitlist moves on a cancellation" is a rule,
date formatting is not). ESLint checks the boundaries.

## 3. Where to put the code

Top to bottom, the first fitting answer:

1. Infrastructure without business rules (a button, the API client, date formatting)? → `shared/`
2. Initialization, a global service, routing? → `app/`
3. Needed by one page? → `pages/<page>/` — **even if the logic is complex.** Duplication between
   pages is acceptable.
4. The scenario is needed in 2+ places already now? → `features/<verb-noun>/`
5. The data, rules or display of an entity are needed in 2+ slices? → `entities/<noun>/`

SHOULD: move out of `pages` only if (a) it is used in several places now, (b) the code has its own
reason to change, (c) the responsibility is named with one word.

## 4. Connecting slices without a cross import

A module declares **what** it needs, and the layer above, which sees both sides, decides **who**
gives it. Take the lowest fitting step:

| #   | Mechanism                                       | When                                                                       |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **props / arguments / events (`emit`)**         | a component 1–2 levels below needs the dependency                          |
| 2   | **slots**                                       | the module must show someone else's UI inside itself                       |
| 3   | **`provide`/`inject` with a `deps` contract**   | the dependency is needed deep in the tree or by many components of a slice |
| 4   | **a factory with dependencies** `createX(deps)` | non-reactive logic that must be tested without Vue                         |

The contract rules (MUST):

- The contract is declared by the consumer, in its own terms; translating someone else's types is
  an adapter in the layer above.
- The contract is minimal: only the functions and values used.
- Async operations return a `Promise`; a cancellation by the user is a value (`null`), not an
  exception.
- Both sides are connected by the lowest layer that sees both (usually `pages`).
- No `provide` — a loud error: `inject` through a helper that throws if there is no value; no silent
  defaults.
- DI is not for everything: an import down the layers (`shared`, types, entity queries) is an
  ordinary import.

## 5. Anatomy of a slice

```text
pages/event/
├── index.ts          MUST: the public API — explicit named exports
├── api/              queryOptions and mutations needed only by the slice
├── model/            pure functions (*.ts + *.test.ts), composables use-*.ts, factories
└── ui/               components (PascalCase.vue) and their tests
```

Segments are created as needed. Names — by the domain (`seats-left.ts`), not by the role
(`helpers.ts`, `utils.ts`, `types.ts`). The levels of logic: `ui` → a composable / a factory (what
to call and in what order) → pure functions (data in — data out). SHOULD: any non-trivial rule or
transformation is a pure function with a unit test.

## 6. State and data

| Class                           | Tool                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Server data                     | `@tanstack/vue-query`: `queryOptions` in the slice's `api/`, `useQuery`/`useMutation`                                          |
| URL (filters, the selected tab) | vue-router: params, query                                                                                                      |
| A form                          | `ref`/`reactive` in the form component; validation — zod (decision of 2026-10-28 21:42; the package comes with the first form) |
| Local UI                        | `ref` in the component                                                                                                         |
| Derived                         | `computed` or a pure function — do not store                                                                                   |

MUST: server data is not copied into a separate store; there are no module singletons with the
user's or the page's data; after a mutation — `invalidateQueries` by key, not a manual edit of the
cache (except optimistic updates with a rollback).

## 7. Errors and async (MUST)

- No empty `catch` and no `catch` that returns "empty data": the error is either shown to the user
  or re-thrown.
- How to show an error is decided by the layer that owns the UX (a page or a feature's composable),
  by `AppError.kind`; pure functions and factories throw.
- Each promise — `await` or `void` with error handling inside.
- No personal data and tokens in logs.

## 8. Tests

| What                                       | How                                                              | Requirement                |
| ------------------------------------------ | ---------------------------------------------------------------- | -------------------------- |
| Pure functions                             | Vitest, without mocks                                            | MUST for non-trivial logic |
| A factory / a composable with dependencies | Vitest with fake `deps`                                          | MUST if there are deps     |
| A component, a page                        | `@vue/test-utils` + MSW + a fresh `QueryClient` (`retry: false`) | SHOULD for user scenarios  |
| The critical path                          | Playwright (`e2e/`)                                              | as the brief requires      |

MUST: check the behavior through the slice's public API; replace dependencies through DI or MSW, not
with `vi.mock` of our own modules. An example of a component test —
`src/pages/health/ui/HealthPage.test.ts`.

What to replace with what:

| What needs replacing                                  | With what                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| HTTP requests                                         | MSW: `server.use(http.get(...))` in the test itself; `onUnhandledFrame: "error"` catches forgotten ones |
| Our own module (a store, a composable, an api module) | do not replace: pass a fake through props, `provide` or `createX(deps)`                                 |
| A browser API without an analog in jsdom              | `vi.stubGlobal("EventSource", FakeEventSource)`; reset — `vi.unstubAllGlobals()` in `afterEach`         |
| Time (timers, `Date`)                                 | `vi.useFakeTimers()` and `vi.setSystemTime(...)`; back — `vi.useRealTimers()` in `afterEach`            |
| Router                                                | a real `createRouter` with `createMemoryHistory()`, not a mock of `useRouter`                           |
| A package from `node_modules`                         | `vi.mock` is acceptable if it has no boundary where it can be replaced without a mock                   |

A fake browser API is a small class in `shared/lib/test/` that the test can "poke"
(`fake.emit(...)`); the logic that uses it gets the constructor through `deps` rather than reading
`globalThis`. If a test cannot be written without `vi.mock` of our own module, the module is too
coupled to its neighbor: fix the boundary, not the test.

## 9. Done when

- `make check-frontend` passes: ESLint (with the boundaries), vue-tsc, Vitest.
- No imports up, between slices or bypassing `index.ts`.
- Non-trivial logic is in pure functions with tests.
- Each async action: loading, error, empty, blocking a repeated submit.
- No `any`, `@ts-ignore`, empty `catch`, `console.log`, dead code, empty segments.

## 10. When in doubt

- Move it out or keep it on the page — keep it.
- `provide`/`inject` or a prop — a prop.
- A new abstraction or a bit of duplication — duplication until the third case.
- Handle it quietly or fail loudly — loudly.
- As in the neighboring file or as in this document — as in the document, and mention the
  divergence.
