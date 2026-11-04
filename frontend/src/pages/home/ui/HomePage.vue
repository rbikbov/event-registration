<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { eventPageCount, publicEventsQuery } from "@/entities/event";
import { eventPath, routes } from "@/shared/config";
import { pageFromQuery } from "@/shared/lib/page-query";
import { PageNav } from "@/shared/ui/page-nav";
import { QueryState } from "@/shared/ui/query-state";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

const page = computed(() => pageFromQuery(route.query.page));
const events = useQuery(computed(() => publicEventsQuery(page.value)));

// Page 1 is the address without `page`.
function link(toPage: number) {
  return { path: routes.home, query: toPage > 1 ? { page: toPage } : {} };
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>

    <QueryState
      v-slot="{ data: loaded }"
      class="mt-6"
      :query="events"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <p v-if="loaded.results.length === 0 && page > 1" class="text-muted-foreground">
        {{ t("pastEnd") }}
        <RouterLink class="underline" :to="link(eventPageCount(loaded.count))">
          {{ t("lastPage") }}
        </RouterLink>
      </p>
      <p v-else-if="loaded.results.length === 0" class="text-muted-foreground">{{ t("empty") }}</p>
      <ul v-else class="grid gap-3">
        <li v-for="event in loaded.results" :key="event.id">
          <Card>
            <CardHeader>
              <CardHeading :level="2" class="leading-snug wrap-anywhere">
                <RouterLink class="underline" :to="eventPath(event.id)">{{
                  event.title
                }}</RouterLink>
              </CardHeading>
            </CardHeader>
            <CardContent class="text-muted-foreground text-sm">
              {{ d(new Date(event.starts_at), "short") }} ·
              {{ event.free_seats > 0 ? t("freeSeats", event.free_seats) : t("noSeats") }}
            </CardContent>
          </Card>
        </li>
      </ul>
      <PageNav
        class="mt-6"
        :page="page"
        :pages="eventPageCount(loaded.count)"
        :link="link"
        :label="t('pages')"
      />
    </QueryState>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "События",
  "error": "Не удалось загрузить события",
  "refreshError": "Не удалось обновить события, показан прежний список",
  "pastEnd": "Здесь событий нет.",
  "lastPage": "К последней странице",
  "pages": "Страницы событий",
  "empty": "Ближайших событий пока нет",
  "freeSeats": "свободно {count} место | свободно {count} места | свободно {count} мест",
  "noSeats": "мест нет"
}
</i18n>
