# English interface and emails: spec

Phase — `docs/roadmap.md`, phase 8. Status: approved 2026-11-21; changed the same day (decision of
02:22: English only, the Russian texts removed).

## What and why

The repository is shown to companies outside Russia, and the interface and the emails were Russian
only. The phase makes every screen text, the emails and the demo data English (decisions of
2026-11-21 00:53 and 01:10). At first the Russian texts were kept next to the English ones for a
later language switch (decision of 01:19); with no switch planned they were dead text, so they are
removed (decision of 02:22) and stay in the git history before this phase.

## Non-Goals

- A second language and a language switch — "What's next" in `docs/roadmap.md`.
- The Django admin language (it stays the Django default, English).
- Translating `docs/task.md` and `docs/session/`.
- Changing the text of emails already queued: the text is a snapshot (phase 2).
- Error texts from the server: the API returns codes, the texts are in the components already.

## Data model

No changes.

## Invariants

| Invariant           | What protects it                                                                      | Test   |
| ------------------- | ------------------------------------------------------------------------------------- | ------ |
| Emails are English  | the templates and `SUBJECTS` in `emails/services.py`; the exact subject of every kind | pytest |
| Screens are English | one `<i18n locale="en">` block per component; the component tests check its texts     | Vitest |

## API

No changes.

## UI

- `createAppI18n()` — the locale `en-GB`, the messages in `<i18n locale="en">` blocks.
  `index.html`: `lang="en"`, an English title.
- While the components were moved one by one, Russian was the fallback for a component without an
  `en` block; the fallback went away with the Russian blocks.

## Edge cases

- A check-in of another day reads "on 2 November at 23:50", of today — "at 09:15" (`formatMoment`
  and the `atTime` / `onDate` texts).
- The demo data (`seed_demo`) — English titles and names.

## Assumptions and open questions

1. Dates: the app locale is `en-GB` — 24-hour time and the day before the month; `Intl` puts "at"
   itself ("31 October at 09:15"), so `formatMoment` and `withAt` stay. The message blocks are
   `locale="en"`; vue-i18n falls back from `en-GB` to `en`. Rejected: `en-US` — "09:15 AM",
   "October 31".
2. Plural forms: the vue-i18n default (`one | other`).
3. Email dates: `7 Oct 2026 09:15 UTC` — the month from a table, not `strftime("%b")`, which
   follows the process locale.
4. e2e moves to English texts; the tests have no Russian text left (decision of 01:42).
5. The phase is the first after the delivery, so it gets a number in the roadmap (8) and the same
   process: stages, review by the `reviewer` agent, a browser pass.

## Acceptance scenarios

| Scenario                                                                           | Level       |
| ---------------------------------------------------------------------------------- | ----------- |
| A fresh browser shows every screen in English, with English dates and plural forms | Vitest, e2e |
| Every email kind is English, with an English date                                  | pytest      |
| A registration → an English ticket email in Mailpit                                | e2e         |
