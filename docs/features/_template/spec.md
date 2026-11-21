# <Feature>: spec

Phase — `docs/roadmap.md`, phase N. Status: draft | approved YYYY-MM-DD.

<!-- Up to 150 lines. The process — the feature-workflow skill. -->

## What and why

<Which requirements from docs/task.md the phase covers — 2–4 sentences.>

## Non-Goals

- <What we do not do in this phase, even though we will want to.>

## Data model

<Tables, fields, database constraints, migrations.>

## Invariants

| Invariant | What protects it                   | Test |
| --------- | ---------------------------------- | ---- |
| …         | a database constraint / a lock / … | …    |

## API

| Method and path | Input | Response | Errors (status → `kind`) |
| --------------- | ----- | -------- | ------------------------ |
| …               | …     | …        | …                        |

## UI

<Screens, states: loading, error, empty, success.>

## Edge cases

- …

## Assumptions and open questions

<!-- What the assignment and architecture.md do not define (field limits, response codes, paging…):
     the chosen default and why. The human confirms or changes it on approval. -->

- <Assumption: …, because …>

## Acceptance scenarios

| Scenario              | Test level            |
| --------------------- | --------------------- |
| Given … When … Then … | pytest / Vitest / e2e |
