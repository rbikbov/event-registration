# Locks and race tests

Rules for code that changes seats, a queue or other shared counters, and for the tests of that
code. Example — `backend/registrations/services.py` and
`backend/registrations/tests/test_concurrency.py`; the email queue — `backend/emails/services.py`
and `backend/emails/tests/test_concurrency.py`.

## Code

1. **One lock per aggregate.** Everything that changes the registrations of an event (`register`,
   `cancel`) first takes `Event.objects.select_for_update()` and only then reads and writes. The
   lock is on the event row, not on a counter: this serializes both the insert of a new row and
   the change of an existing one.
2. **State is read after the lock.** Everything the decision depends on (the registration status,
   the number of taken seats) is read inside the transaction after `select_for_update`. A status
   read before the lock may have changed: before the lock `cancel` reads only the `event_id` by the
   token.
3. **Time — after the lock.** The timestamp that defines the order (`queued_at`) is taken inside
   the lock. Taken before it, it puts a late request into the queue ahead of an early one and
   shifts the positions already reported to clients. For the same reason the timestamp cannot be
   earlier than the last one in the queue: the wall clock can jump back (`_queue_time` in
   `registrations/services.py`).
4. **Uniqueness — also as a database constraint.** The lock protects against the race, the
   constraint (`UniqueConstraint(event, email)`) is a safety net in case a path without the lock
   ever gets into the code.
5. **No network calls and no email sending inside the lock:** the lock is held for the duration of
   the transaction. Emails go through the outbox in the same transaction (phase 2).
6. **A queue processed by several processes — `select_for_update(skip_locked=True)`.** The worker
   takes a batch of outbox rows with a lock and holds it until the commit in which it writes
   `sent`; a second worker skips the locked rows and takes others instead of waiting and sending
   the same email. The Event lock is not held meanwhile. A crash between sending and the commit
   gives a repeat: delivery is "at least once".
   The reminder pass (`enqueue_reminders`) takes events the same way: an event held by a
   reschedule is skipped until the next pass — read past the lock, it would give a reminder about
   the old date.

## Tests

1. A race test is `pytest.mark.django_db(transaction=True)`: the threads open their own
   connections, the data must be committed. The test runs on Postgres; SQLite and mocks will not
   do.
2. The threads start at the same time through `threading.Barrier`; each thread closes its
   connection (`connection.close()`) in `finally`, otherwise the test leaves open connections and
   the database is not dropped. A thread's error is re-raised in the test — `run_together` in
   `backend/config/tests/concurrency.py`.
3. The final state and the invariant are checked, not the order: "exactly as many seats are taken
   as the capacity", "one row per email", "exactly one is promoted". The order in which the threads
   got the lock is undefined.
4. **The test is checked for failing:** temporarily remove `select_for_update` (or move `now`
   before the lock) — the test must fail. A test that passes without the lock protects nothing.
   The race is probabilistic, so before closing the task the test is run 20 times in a row:

   ```sh
   cd backend && for i in $(seq 20); do uv run pytest registrations/tests/test_concurrency.py emails/tests/test_concurrency.py -q || break; done
   ```

5. Not every lock is visible in one test: a cancellation in parallel with a registration passes
   even without the lock in `cancel`, because the cancellation is atomic in one transaction. The
   `cancel` lock is caught by parallel cancellations (one token, different tokens). Each lock needs
   a test that fails without it.
6. **A race test does not depend on the wall clock.** The moment when the records are already due
   is passed into `now` from the test data (the latest time in them), not taken from the clock: in
   WSL2 the clock jumps back by fractions of a second (`docs/development.md`, "Gotchas"). If a race
   test fails once in a while, for example 1 time in 30, first check whether it depends on the
   clock, and only then look for an error in the lock.
