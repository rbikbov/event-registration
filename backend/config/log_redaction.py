import logging
import re

# The manage token in a ticket link is the only key to the ticket: whoever reads it can see the
# code and cancel. Request paths reach the logs through uvicorn's access log and Django's
# "Not Found" warnings.
_TICKET_TOKEN = re.compile(r"(/api/tickets/)[^/?#\s]+")


def _redact(value: str) -> str:
    return _TICKET_TOKEN.sub(r"\1<token>", value)


class RedactTicketTokens(logging.Filter):
    """Replaces the manage token in request paths; the record is still logged."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(_redact(a) if isinstance(a, str) else a for a in record.args)
        return True
