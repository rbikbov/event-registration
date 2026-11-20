# English interface and emails: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

## Stage 1. English by default (the only stage)

- [x] 1.1. Tracer bullet: `createAppI18n` — `en-GB` by default, `ru` as the fallback, English
      date formats; `en` blocks in `App`, `AppLayout`, `HomePage`, `OrgEventsPage` (both lists share
      the e2e helpers), `NotFoundPage`; `index.html` in English; the Vitest test of matching
      `en`/`ru` keys (it lists the files without `en` until 1.3). Done when: Vitest of these
      components checks English; the home page is English in the browser.
- [x] 1.2. The participant's screens: the event page and the registration form, the ticket, login,
      `/health`, the `shared/ui` components. Done when: their Vitest tests check English.
- [x] 1.3. The organizer's screens: creation and editing (`entities/event` form errors),
      the event layout, the participants, check-in; the key test has no exceptions left. Done when:
      Vitest is green, no component without `en`.
- [x] 1.4. Emails in English: `emails/templates/emails/en/` and `ru/`, the subjects by locale (`en`
      for all), the English date format; `seed_demo` in English. Done when: pytest of
      the emails and the seed checks English.
- [ ] 1.5. e2e in English; README and docs: the interface and the emails are English by default.
      Done when: `make stack-e2e` is green.

- [ ] 1.6. Closing the phase: `architecture.md`, `features.md`, the requirement tables, roadmap.

## Log

- The base of stage 1 — `b669fab`.
- 1.1: the tests of the components translated later that compare a date with Russian `Intl` mount
  with `createAppI18n("ru")` until their component is translated; the dates follow the app locale.

## Later
