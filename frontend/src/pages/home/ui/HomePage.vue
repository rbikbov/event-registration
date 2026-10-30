<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { routes } from "@/shared/config";

const { t } = useI18n({ useScope: "local" });
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
    <ul class="mt-4 grid gap-2">
      <li>
        <RouterLink class="underline" :to="routes.login">{{ t("login") }}</RouterLink>
      </li>
      <li>
        <RouterLink class="underline" :to="routes.orgEvents">{{ t("orgEvents") }}</RouterLink>
      </li>
      <li>
        <RouterLink class="underline" :to="routes.health">{{ t("health") }}</RouterLink>
      </li>
    </ul>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Регистрация на мероприятия",
  "login": "Вход для организатора",
  "orgEvents": "События организатора",
  "health": "Состояние сервиса"
}
</i18n>
