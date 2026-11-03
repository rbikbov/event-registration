<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";

import { publicEventsQuery } from "@/entities/event";
import { eventPath } from "@/shared/config";
import { QueryState } from "@/shared/ui/query-state";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

const { t, d } = useI18n({ useScope: "local" });
const events = useQuery(publicEventsQuery);

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>

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
              <CardHeading :level="2" class="leading-snug wrap-anywhere">
                <RouterLink class="underline" :to="eventPath(event.id)">{{
                  event.title
                }}</RouterLink>
              </CardHeading>
            </CardHeader>
            <CardContent class="text-muted-foreground text-sm">
              {{ startsAt(event.starts_at) }} ·
              {{ event.free_seats > 0 ? t("freeSeats", event.free_seats) : t("noSeats") }}
            </CardContent>
          </Card>
        </li>
      </ul>
    </QueryState>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "События",
  "error": "Не удалось загрузить события",
  "refreshError": "Не удалось обновить события, показан прежний список",
  "empty": "Ближайших событий пока нет",
  "freeSeats": "свободно {count} место | свободно {count} места | свободно {count} мест",
  "noSeats": "мест нет"
}
</i18n>
