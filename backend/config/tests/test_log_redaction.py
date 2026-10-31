import logging

import pytest

from config.log_redaction import RedactTicketTokens

TOKEN = "s3cr3t-Token_value"


def record(msg: str, *args: object) -> logging.LogRecord:
    return logging.LogRecord("test", logging.INFO, __file__, 1, msg, args, None)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        (f"/api/tickets/{TOKEN}/", "/api/tickets/<token>/"),
        (f"/api/tickets/{TOKEN}/cancel/", "/api/tickets/<token>/cancel/"),
        (f"/api/tickets/{TOKEN}", "/api/tickets/<token>"),
        (f"/api/tickets/{TOKEN}/?x=1", "/api/tickets/<token>/?x=1"),
        ("/api/events/7/", "/api/events/7/"),
    ],
)
def test_the_token_in_a_path_argument_is_replaced(path: str, expected: str) -> None:
    rec = record("Not Found: %s", path)

    assert RedactTicketTokens().filter(rec) is True
    assert rec.getMessage() == f"Not Found: {expected}"


def test_the_uvicorn_access_arguments_keep_their_shape() -> None:
    # uvicorn's AccessFormatter unpacks exactly these five arguments.
    rec = record(
        '%s - "%s %s HTTP/%s" %d', "1.2.3.4:5", "GET", f"/api/tickets/{TOKEN}/", "1.1", 200
    )

    RedactTicketTokens().filter(rec)

    assert rec.args == ("1.2.3.4:5", "GET", "/api/tickets/<token>/", "1.1", 200)


def test_a_token_in_an_already_formatted_message_is_replaced() -> None:
    rec = record(f"GET /api/tickets/{TOKEN}/ failed")

    RedactTicketTokens().filter(rec)

    assert TOKEN not in rec.getMessage()


@pytest.mark.parametrize("name", ["uvicorn.access", "django.request", "django.server"])
def test_the_loggers_that_print_request_paths_redact_tokens(name: str) -> None:
    rec = record("%s", f"/api/tickets/{TOKEN}/")

    logging.getLogger(name).filter(rec)

    assert rec.getMessage() == "/api/tickets/<token>/"
