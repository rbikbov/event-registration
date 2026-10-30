<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { orgEventsQuery } from "@/entities/event";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/shadcn/card";

const { t, d } = useI18n({ useScope: "local" });
const { data: events, isPending, isError, refetch } = useQuery(orgEventsQuery);

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
      <Button as-child>
        <RouterLink :to="routes.orgEventsNew">{{ t("create") }}</RouterLink>
      </Button>
    </div>

    <p v-if="isPending" class="text-muted-foreground mt-6" role="status">{{ t("loading") }}</p>
    <Alert v-else-if="isError" variant="destructive" class="mt-6" role="alert">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ t("error") }}
        <Button variant="outline" size="sm" @click="refetch()">{{ t("retry") }}</Button>
      </AlertDescription>
    </Alert>
    <p v-else-if="events && events.length === 0" class="text-muted-foreground mt-6">
      {{ t("empty") }}
    </p>
    <ul v-else-if="events" class="mt-6 grid gap-3">
      <li v-for="event in events" :key="event.id">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{{ event.title }}</CardTitle>
          </CardHeader>
          <CardContent class="text-muted-foreground text-sm">
            {{ startsAt(event.starts_at) }} · {{ t("capacity", event.capacity) }}
          </CardContent>
        </Card>
      </li>
    </ul>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "События",
  "create": "Создать событие",
  "loading": "Загружаем…",
  "error": "Не удалось загрузить события",
  "retry": "Повторить",
  "empty": "Событий пока нет",
  "capacity": "{count} место | {count} места | {count} мест"
}
</i18n>
