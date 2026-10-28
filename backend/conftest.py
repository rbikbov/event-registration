import pytest
from django.core.management import call_command


@pytest.fixture(scope="session", autouse=True)
def collected_static() -> None:
    # Tests run with DEBUG=False, so WhiteNoise and the manifest storage serve static from
    # STATIC_ROOT exactly as in production; collect it once instead of swapping the storage.
    call_command("collectstatic", interactive=False, verbosity=0)
