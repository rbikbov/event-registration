"""Reading an SSE stream in tests."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from django.db import connection
from django.http import StreamingHttpResponse
from django.test import AsyncClient

from registrations.services import check_in, register

# What EventSource sends; DRF would answer it with 406 without the view's own negotiation.
SSE = {"accept": "text/event-stream"}


def checked_in(event_id: int, code: str) -> None:
    try:
        check_in(event_id, code)
    finally:
        # A connection left open in the worker thread keeps the test database from being dropped.
        connection.close()


def registered(event_id: int, email: str) -> None:
    try:
        register(event_id, email, "N")
    finally:
        connection.close()


@asynccontextmanager
async def stream(client: AsyncClient, url: str) -> AsyncIterator[StreamingHttpResponse]:
    response = await client.get(url, headers=SSE)
    assert response.status_code == 200
    assert isinstance(response, StreamingHttpResponse)
    try:
        yield response
    finally:
        # What a disconnect does: the subscription and the listener are released.
        await response.streaming_content.aclose()


async def next_message(response: StreamingHttpResponse) -> tuple[str, Any]:
    chunk = await asyncio.wait_for(anext(aiter(response.streaming_content)), timeout=5)  # type: ignore[arg-type]  # async content under AsyncClient
    fields = dict(line.split(": ", 1) for line in bytes(chunk).decode().splitlines() if line)
    return fields["event"], json.loads(fields["data"])
