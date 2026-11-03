<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { QueryState } from "@/shared/ui/query-state";

import { healthQuery } from "../api/health";

const { t } = useI18n({ useScope: "local" });
const health = useQuery(healthQuery);
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
    <!-- The backend answers 200 only when the database answers too: a loaded answer means both
       work. A down database (503 from the backend) and a down backend (502 from the proxy) are
       the same `server` error, so the error text names neither. -->
    <QueryState
      class="mt-6"
      :query="health"
      :error-text="t('unavailable')"
      :refresh-error-text="t('refreshError')"
    >
      <p class="font-medium" data-health>{{ t("ok") }}</p>
    </QueryState>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Состояние сервиса",
  "ok": "Backend и база данных работают",
  "unavailable": "Backend или база данных не отвечают",
  "refreshError": "Backend или база данных перестали отвечать, показан прежний ответ"
}
</i18n>
