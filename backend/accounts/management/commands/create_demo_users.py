from typing import Any

from django.core.management.base import BaseCommand

from accounts.models import User

# Documented demo credentials for reviewers and e2e (docs/architecture.md, "Окружение").
# The organizer has no admin rights; the admin signs in to /admin/ only.
DEMO_ORGANIZER = ("demo@example.com", "demo")
DEMO_ADMIN = ("admin@example.com", "admin")


class Command(BaseCommand):
    help = "Create or reset the demo organizer and the demo admin."

    def handle(self, *args: Any, **options: Any) -> None:
        for (email, password), is_admin in ((DEMO_ORGANIZER, False), (DEMO_ADMIN, True)):
            user, _ = User.objects.get_or_create(email=email)
            user.set_password(password)
            user.is_active = True
            user.is_staff = is_admin
            user.is_superuser = is_admin
            user.save()
        self.stdout.write("Demo users are ready.")
