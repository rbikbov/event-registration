<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { orgEventsQuery } from "@/entities/event";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { QueryState } from "@/shared/ui/query-state";
import { Button } from "@/shared/ui/shadcn/button";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

const { t, d } = useI18n({ useScope: "local" });
const events = useQuery(orgEventsQuery);

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

    <QueryState
      v-slot="{ data: loaded }"
      class="mt-6"
      :query="events"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <p v-if="loaded.length === 0" class="text-muted-foreground">{{ t("empty") }}</p>
      <ul v-else class="grid gap-3">
        <li v-for="event in loaded" :key="event.id">
          <Card>
            <CardHeader>
              <CardHeading :level="2">
                <RouterLink class="hover:underline" :to="orgEventPath(event.id)">
                  {{ event.title }}
                </RouterLink>
              </CardHeading>
            </CardHeader>
            <CardContent class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground text-sm">
                {{ startsAt(event.starts_at) }} ·
                {{ t("seats", { confirmed: event.confirmed, capacity: event.capacity }) }} ·
                {{ t("waitlist", { count: event.waitlisted }) }}
              </span>
              <Button variant="outline" size="sm" as-child>
                <RouterLink :to="checkinPath(event.id)">{{ t("checkin") }}</RouterLink>
              </Button>
            </CardContent>
          </Card>
        </li>
      </ul>
    </QueryState>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Мои события",
  "create": "Создать событие",
  "error": "Не удалось загрузить события",
  "refreshError": "Не удалось обновить события, показан прежний список",
  "empty": "Событий пока нет",
  "seats": "Занято {confirmed} из {capacity}",
  "waitlist": "в листе ожидания {count}",
  "checkin": "Чекин"
}
</i18n>
