from typing import cast

from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.serializers import LoginSerializer, UserSerializer


class LoginView(APIView):
    """Starts a session. Wrong credentials are 400, not 401, so the frontend does not
    mistake them for an expired session."""

    permission_classes = (AllowAny,)

    @extend_schema(request=LoginSerializer, responses={200: UserSerializer})
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """The frontend asks who is signed in; the response also hands out the CSRF cookie
    that it sends back in X-CSRFToken on unsafe requests."""

    @extend_schema(responses={200: UserSerializer})
    def get(self, request: Request) -> Response:
        # IsAuthenticated (the default permission) keeps AnonymousUser out of this branch.
        return Response(UserSerializer(cast(User, request.user)).data)
