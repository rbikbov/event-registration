from typing import Any, ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager["User"]):
    """Creates users identified by email; there is no username."""

    def _create_user_by_email(
        self, email: str, password: str | None, **extra_fields: Any
    ) -> "User":
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(  # type: ignore[override]  # email replaces the username argument
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "User":
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user_by_email(email, password, **extra_fields)

    def create_superuser(  # type: ignore[override]  # email replaces the username argument
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self._create_user_by_email(email, password, **extra_fields)

    def get_by_natural_key(self, username: str | None) -> "User":
        # Sign-in looks the user up by email; stored emails are lowercase.
        return self.get(email=(username or "").lower())


class User(AbstractUser):
    """Organizer account. Signs in with email; participants have no accounts.

    Email is stored lowercase, so the plain unique constraint is case-insensitive.
    """

    username = None  # type: ignore[assignment]  # email is the login
    email = models.EmailField(unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)
