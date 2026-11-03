<script setup lang="ts">
import { watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import AppLayout from "./ui/AppLayout.vue";

const { t } = useI18n({ useScope: "local" });
const route = useRoute();

// By the page, not by its data: the title of an event is not known until it loads. The meta of a
// route is merged with its parents', so a tab of the event layout gives the title.
watchEffect(() => {
  const page = route.meta.title;
  document.title = page ? `${t(`titles.${page}`)} — ${t("app")}` : t("app");
});
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>

<i18n lang="json" locale="ru">
{
  "app": "Регистрация на мероприятия",
  "titles": {
    "home": "События",
    "event": "Событие",
    "health": "Состояние сервиса",
    "login": "Вход",
    "orgEvents": "Мои события",
    "orgEventsNew": "Новое событие",
    "participants": "Участники",
    "checkin": "Чекин",
    "edit": "Редактирование",
    "ticket": "Билет",
    "notFound": "Страница не найдена"
  }
}
</i18n>
