from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.contrib import admin


def test_every_model_of_project_apps_is_registered_in_admin() -> None:
    # Project apps are the top-level folders of backend/; third-party apps live elsewhere.
    project_apps = [
        config for config in apps.get_app_configs() if Path(config.path).parent == settings.BASE_DIR
    ]
    missing = [
        model._meta.label
        for config in project_apps
        for model in config.get_models()
        if not admin.site.is_registered(model)
    ]

    assert project_apps, "no project apps found: check how they are detected"
    assert missing == [], f"register these models in admin: {missing}"
