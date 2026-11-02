import logging
import time
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
        try:
            if time.monotonic() >= self.next_reminders_at:
                queued = enqueue_reminders()
                # After the pass: a failed one is tried again at the next poll.
                self.next_reminders_at = time.monotonic() + REMINDER_INTERVAL
                if queued:
                    self.stdout.write(f"Queued {queued} reminders.")
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
