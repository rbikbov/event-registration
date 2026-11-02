import logging
import time
import traceback
from typing import Any

from django.core.management.base import BaseCommand
from django.db import DatabaseError, close_old_connections

from emails.services import process_batch
from registrations.services import enqueue_reminders

logger = logging.getLogger(__name__)

# Seconds to wait when the outbox has nothing due; an email waits about this long at most.
POLL_INTERVAL = 1
# Seconds to wait after a database error, so that a database being down does not flood the log.
DB_ERROR_PAUSE = 5
# Seconds between reminder passes: a reminder is late by about this much at most.
REMINDER_INTERVAL = 30


class Command(BaseCommand):
    help = "Queue reminders and send queued outbox emails in a loop until stopped."

    # time.monotonic() of the next reminder pass; the first poll makes one.
    next_reminders_at = 0.0

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write("Worker started.")
        while True:
            time.sleep(self.poll())

    def poll(self) -> float:
        """Queue reminders if their pass is due, send one batch; return the seconds to wait."""
        self.remind()
        try:
            sent = process_batch()
        except DatabaseError as error:
            # The class only, as for SMTP errors: the text may hold data from the rows.
            logger.warning("Outbox poll failed: %s", type(error).__name__)
            # Drop the broken connection; the next poll opens a new one.
            close_old_connections()
            return DB_ERROR_PAUSE
        # Ids only: addresses and the links with tokens stay out of the logs.
        for email_id in sent:
            self.stdout.write(f"Sent email {email_id}.")
        return 0 if sent else POLL_INTERVAL

    def remind(self) -> None:
        """Run the reminder pass if it is due; its failure never stops the outbox.

        A failed pass is tried again in REMINDER_INTERVAL, like a successful one: a pass that
        keeps failing would otherwise run, and log, on every poll.
        """
        if time.monotonic() < self.next_reminders_at:
            return
        self.next_reminders_at = time.monotonic() + REMINDER_INTERVAL
        try:
            queued = enqueue_reminders()
        except DatabaseError as error:
            logger.warning("Reminder pass failed: %s", type(error).__name__)
            close_old_connections()
            return
        # Any error, not only database ones: the process would end, compose would restart it,
        # and the first poll would fail on the same pass again, before any email is sent.
        except Exception as error:
            # A bug: the stack shows where; its frames hold code lines, not the rows' data.
            stack = "".join(traceback.format_tb(error.__traceback__))
            logger.error("Reminder pass failed: %s\n%s", type(error).__name__, stack)
            return
        if queued:
            self.stdout.write(f"Queued {queued} reminders.")
