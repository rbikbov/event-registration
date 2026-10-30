import time
from typing import Any

from django.core.management.base import BaseCommand

from emails.services import process_batch

# Seconds to wait when the outbox has nothing due; an email waits about this long at most.
POLL_INTERVAL = 1


class Command(BaseCommand):
    help = "Send queued outbox emails in a loop until stopped."

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write("Worker started.")
        while True:
            sent = process_batch()
            # Ids only: addresses and the links with tokens stay out of the logs.
            for email_id in sent:
                self.stdout.write(f"Sent email {email_id}.")
            if not sent:
                time.sleep(POLL_INTERVAL)
