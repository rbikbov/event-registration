from drf_spectacular.authentication import SessionScheme
from rest_framework.authentication import SessionAuthentication
from rest_framework.request import Request


class SessionAuthenticationWith401(SessionAuthentication):
    """Session auth that answers 401 to an anonymous request instead of 403.

    DRF turns "not authenticated" into 401 only when the first authentication class has an
    authenticate header, and the session scheme has none. Without it a guest and a signed-in
    organizer opening someone else's event would both get 403 and the frontend could not tell
    "sign in" from "no access".
    """

    def authenticate_header(self, request: Request) -> str:
        return "Session"


class SessionAuthenticationWith401Scheme(SessionScheme):  # type: ignore[no-untyped-call]  # drf-spectacular extension base is untyped
    """Documents the subclass in OpenAPI exactly as the session cookie scheme it extends."""

    target_class = "accounts.authentication.SessionAuthenticationWith401"
