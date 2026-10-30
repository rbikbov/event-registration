<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { healthQuery } from "../api/health";

const { t } = useI18n({ useScope: "local" });
const { data, isPending, isError } = useQuery(healthQuery);
</script>

<template>
  <main>
    <h1>{{ t("title") }}</h1>
    <p v-if="isPending">{{ t("loading") }}</p>
    <p v-else-if="isError" role="alert">{{ t("unavailable") }}</p>
    <p v-else-if="data">{{ t("status", { status: data.status, database: data.database }) }}</p>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Состояние сервиса",
  "loading": "Проверяем backend…",
  "unavailable": "Backend недоступен",
  "status": "Backend: {status}, база данных: {database}"
}
</i18n>
