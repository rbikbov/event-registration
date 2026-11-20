# English interface and emails: spec

Phase — `docs/roadmap.md`, phase 8. Status: draft.

## What and why

The repository is shown to companies outside Russia, and the interface and the emails are Russian
only. The phase adds English next to Russian and makes English the default (decisions of
2026-11-21 00:53 and 01:10): every screen text, the emails and the demo data have an
English version, and the app shows it. The Russian texts stay as the fallback language and for a
later language switch (decision of 2026-11-21 01:19): nothing shows them until then — a deliberate
exception to rule 3 of `AGENTS.md`; the test of matching keys keeps the two languages from drifting
apart.

## Non-Goals

- A language switch and the email language chosen at registration — a later phase, done properly:
  the language in the address (`/en/…`, `/ru/…`), the first choice by `Accept-Language`, the
  switch in the header, `Registration.locale` for the emails ("What's next" in `docs/roadmap.md`).
- Languages other than English and Russian.
- The Django admin language (it stays the Django default, English).
- Translating `docs/task.md` and `docs/session/`.
- The organizer's own language for anything stored on the server: the organizer has no emails.
- Changing the language of emails already queued: the text is a snapshot (phase 2).
- Error texts from the server: the API returns codes, the texts are in the components already.

## Data model

No changes.

## Invariants

| Invariant                                    | What protects it                                                                                                       | Test   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Every text a screen shows has both languages | an `en` and a `ru` block in each component; a Vitest test compares the key sets of the two blocks in every `.vue` file | Vitest |
| Emails are English                           | the `en` templates and subjects in `_enqueue`                                                                          | pytest |

## API

No changes.

## UI

- `createAppI18n(locale = "en-GB")`, `fallbackLocale: "ru"`: a component without an
  `en` block still shows Russian, so the components move one by one. `<i18n locale="en">` next to
  each `<i18n locale="ru">`; the tests of a component check its English texts. `index.html`:
  `lang="en"`, an English title.

## Edge cases

- A text added later only in English — the key test fails; the Russian version is written in the
  same commit.
- The demo data (`seed_demo`) — English titles and names.

## Assumptions and open questions

1. Dates: the app locale is `en-GB` — 24-hour time and the day before the month, as in Russian;
   `Intl` puts "at" itself ("31 October at 09:15"), so `formatMoment` and `withAt` stay. The
   message blocks are `locale="en"`; vue-i18n falls back from `en-GB` to `en` to `ru`.
   Rejected: `en-US` — "09:15 AM", "October 31", a second style of dates next to the Russian one.
2. Plural forms: English uses the vue-i18n default (`one | other`), `russianPlural` stays for `ru`.
3. Email dates: `en` — `31 Oct 2026 09:15 UTC`, `ru` — as now, `31.10.2026 09:15 UTC`.
4. The templates move to `emails/templates/emails/<locale>/<kind>.txt`, the subjects — a table by
   kind and locale in `emails/services.py`; the sending uses `en`. The Russian ones stay for the
   later phase.
5. e2e moves to English texts.
6. The phase is the first after the delivery, so it gets a number in the roadmap (8) and the same
   process: stages, review by the `reviewer` agent, a browser pass.

## Acceptance scenarios

| Scenario                                                                           | Level       |
| ---------------------------------------------------------------------------------- | ----------- |
| Every `.vue` with `<i18n>` has `en` and `ru` blocks with the same keys             | Vitest      |
| A fresh browser shows every screen in English, with English dates and plural forms | Vitest, e2e |
| Every email kind is English, with an English date                                  | pytest      |
| A registration → an English ticket email in Mailpit                                | e2e         |
