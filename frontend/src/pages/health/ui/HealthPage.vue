<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { QueryState } from "@/shared/ui/query-state";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

import { healthQuery } from "../api/health";

const { t } = useI18n({ useScope: "local" });
const health = useQuery(healthQuery);
</script>

<template>
  <div class="mx-auto max-w-xl">
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
    <!-- 503 is the answer "unavailable": the backend sends it when the database is down. -->
    <QueryState
      v-slot="{ data }"
      class="mt-6"
      :query="health"
      :error-text="t('unavailable')"
      :refresh-error-text="t('refreshError')"
    >
      <Card>
        <CardHeader>
          <CardHeading :level="2">{{ t("backend") }}</CardHeading>
        </CardHeader>
        <CardContent>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt class="text-muted-foreground">{{ t("status") }}</dt>
            <dd data-health="status">{{ t(`states.${data.status}`) }}</dd>
            <dt class="text-muted-foreground">{{ t("database") }}</dt>
            <dd data-health="database">{{ t(`states.${data.database}`) }}</dd>
          </dl>
        </CardContent>
      </Card>
    </QueryState>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Состояние сервиса",
  "backend": "Backend",
  "status": "Сервис",
  "database": "База данных",
  "unavailable": "Backend недоступен",
  "states": {
    "ok": "работает",
    "error": "ошибка"
  },
  "refreshError": "Не удалось проверить backend снова, показан прежний ответ"
}
</i18n>
