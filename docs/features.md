# What works

All requirements of the assignment are done and covered by tests — the
[README](../README.md#requirements-and-tests) and the [full table](requirements.md). The course of
work by phases is in [roadmap.md](roadmap.md).

What works:
organizer login (demo: `demo@example.com` / `demo`), event creation, the public list and the event
page with registration, a waitlist with a position, protection against races for the last seat and
for one email. Emails — with a ticket, about getting onto the waitlist and about getting a seat
after someone else cancelled — go through the outbox and the worker to Mailpit
(<http://localhost:8025>), with retries on an SMTP error. The ticket page from the email link shows
the code, the place on the waitlist or the cancellation, and lets the participant cancel. The
organizer sees the event panel — counters of confirmed, waitlisted and arrived participants, a
paged list of participants with a status filter — and checks tickets in at the entrance by code: a
ticket passes once, including under simultaneous requests, a repeat shows the time of the first
check-in; a checked-in ticket cannot be cancelled. The panel counters and the free seats on the
event page update without a reload in all open tabs (SSE and Postgres `LISTEN/NOTIFY`); on a break
the panel shows "Connection lost, reconnecting…" and gets the correct counters after reconnecting.
The organizer edits an event: on a date change the confirmed and waitlisted participants get an
email, a higher limit gives seats to the first ones on the waitlist, a limit below the confirmed
count is not accepted. A day before the event everyone who got a seat earlier gets exactly one
reminder — after a reschedule a new one, about the new date. `make seed` adds demo events with
participants.
All screens are in a shared layout with a header: organizer login and logout, a return to the open
page after login, the same loading, error with a retry and a link to the service status, "not
found" for an unknown address; without network — a bar under the header. Event lists have 20 per
page, with the "Upcoming" and "Past" tabs. Every screen fits the width of a phone (360 px).
The interface and the emails are in English; each component keeps a Russian version of its texts
for a later language switch.

Linters, type checks and tests pass locally and in CI on every PR (`make check`, `make e2e`).
