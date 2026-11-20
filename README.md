# Event registration

A test assignment: an event registration service with a seat limit, a waitlist, tickets and
check-in. Stack: Vue 3 + Vite, Django + DRF, PostgreSQL 17. All requirements of the assignment are
done and covered by tests; what exactly works — [docs/features.md](docs/features.md).

## Running

You only need Docker with Compose and `make`.

```sh
make up          # the whole stack in Docker
make demo-users  # the demo organizer account: demo@example.com / demo
make seed        # demo events with participants
```

Open <http://localhost:5173>, emails are in Mailpit at <http://localhost:8025>. To stop —
`make down`. Services, ports and development — [docs/development.md](docs/development.md).

The interface and the emails are in Russian.

## What the tests prove

- **The last seat:** two people at once — the seat goes to one, the other is on the waitlist; one
  email — one registration. A lock on the event row, races — `docs/rules/concurrency.md`.
- **Check-in:** a ticket passes once, including under simultaneous requests (a conditional
  `UPDATE`).
- **Emails:** through a transactional outbox and a separate worker, with retries on an SMTP error;
  delivery is "at least once".
- **Reminder:** exactly one a day before the event, after a reschedule — a new one, about the new
  date.
- **Live:** the organizer's counters and the free seats update in all tabs (SSE + Postgres
  `LISTEN/NOTIFY`); e2e with two browser contexts.

Linters, types, pytest, Vitest and Playwright run in CI on every PR (`make check`, `make e2e`).

## Requirements and tests

Paths are from the repository root; `pytest` — `backend/`, `Vitest` — `frontend/src/`, e2e — `e2e/tests/`.
That each test mentioned exists is checked by `make check-readme` (part of `make check`).

The items of the assignment in its own words; the general requirements and a detailed table for
each behavior — [docs/requirements.md](docs/requirements.md).

| Requirement of the assignment                                                              | Test                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An event: description, date and time, seat limit                                           | `events/tests/test_org_events_api.py::test_create_makes_the_caller_the_organizer`, `::test_create_requires_all_main_fields`; e2e `organizer-creates-event.spec.ts`                                                                                               |
| A participant registers by email                                                           | `registrations/tests/test_registration_api.py::test_register_returns_201_and_status_without_secrets`; e2e `participant-registers.spec.ts`                                                                                                                        |
| Cancelling participation                                                                   | `registrations/tests/test_cancel.py::test_cancel_api_returns_200_and_status`; e2e `participant-opens-ticket.spec.ts`                                                                                                                                             |
| A waitlist when the seats run out                                                          | `registrations/tests/test_services.py::test_register_waitlists_when_no_seats_are_left`; e2e `participant-registers.spec.ts`                                                                                                                                      |
| A ticket with a code and a check-in screen at the entrance (code input)                    | `registrations/tests/test_checkin.py::test_check_in_marks_a_confirmed_ticket`; e2e `organizer-checks-in.spec.ts`                                                                                                                                                 |
| The organizer's screen: how many registered, on the waitlist, arrived                      | `events/tests/test_org_event_detail_api.py::test_detail_has_the_event_and_its_counts`; e2e `two-participants-last-seat.spec.ts`, `organizer-checks-in.spec.ts`                                                                                                   |
| A registered participant gets an email with the ticket                                     | `registrations/tests/test_emails.py::test_register_on_a_seat_queues_one_ticket_email`; `emails/tests/test_worker.py::test_pending_email_is_sent_and_marked_sent`; e2e `participant-opens-ticket.spec.ts`                                                         |
| Registering again with the same email does not create a second seat                        | `registrations/tests/test_registration_api.py::test_repeat_returns_200_and_no_second_registration`; `registrations/tests/test_concurrency.py::test_parallel_registrations_of_one_email_make_one_registration`                                                    |
| Someone cancelled — the first one on the waitlist automatically gets the seat and an email | `registrations/tests/test_emails.py::test_cancel_confirmed_queues_promoted_for_the_waitlist_head`; e2e `waitlisted-gets-promoted.spec.ts`                                                                                                                        |
| Two people for the last seat at once: the seat goes to one, the other to the waitlist      | `registrations/tests/test_concurrency.py::test_parallel_registrations_for_the_last_seat_confirm_exactly_one`; e2e with two browsers `two-participants-last-seat.spec.ts`                                                                                         |
| A day before the event all participants get a reminder, exactly one                        | `registrations/tests/test_reminders.py::test_open_window_reminds_each_seat_once`; `emails/tests/test_run_worker.py::test_worker_queues_reminders_once_an_interval`. No e2e: a test cannot wait a day; live — `make seed`, ~30 s later three reminders in Mailpit |
| A ticket passes check-in once                                                              | `registrations/tests/test_concurrency.py::test_parallel_check_ins_of_one_code_mark_it_once`; e2e `organizer-checks-in.spec.ts` (a repeat at one entrance and «one code at two entrances at once …»)                                                              |
| The organizer's arrived counter updates live                                               | e2e `organizer-sees-arrivals-live.spec.ts`; `events/tests/test_org_event_stream_api.py::test_check_in_sends_a_new_snapshot`                                                                                                                                      |
| The organizer rescheduled the event — all participants get an email                        | `registrations/tests/test_update_event.py::test_reschedule_emails_confirmed_and_waitlisted_and_bumps_the_version`; e2e `organizer-reschedules-event.spec.ts`                                                                                                     |

## Limitations

- Local run only: development mode, no HTTPS, no deployment.
- Live updates are held by one backend process: enough for a demo, thousands of connections need a
  push server.
- Emails are "at least once": if the worker crashes between sending and marking, the email goes out
  again.
- Organizers are created by a command or in the admin, there is no sign-up screen; one can register
  for an event that has started.
- Once in a while one Vitest run is flaky (`vue-i18n` after jsdom is closed), a rerun is green.

What was postponed and what is needed to turn this into a product — [docs/roadmap.md](docs/roadmap.md#whats-next).

## Documents

- [The assignment](docs/task.md) (in Russian) and [the decision log with the time](docs/decisions.md)
- [How the system works](docs/architecture.md) and [the course of work by phases](docs/roadmap.md)
- [How it was built with AI](docs/ai-workflow.md): Claude Code, the agent rules, review, session
  export, what was borrowed
- `AGENTS.md` in the folders — rules for the agent; `CLAUDE.md` next to each is one line
  `@AGENTS.md`, because Claude Code reads only that file.
