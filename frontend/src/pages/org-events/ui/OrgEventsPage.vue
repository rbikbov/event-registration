<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import {
  eventPageCount,
  periodFromQuery,
  orgEventsQuery,
  type EventPeriod,
} from "@/entities/event";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { pageFromQuery } from "@/shared/lib/page-query";
import { FilterLink } from "@/shared/ui/filter-link";
import { PageNav } from "@/shared/ui/page-nav";
import { QueryState } from "@/shared/ui/query-state";
import { Button } from "@/shared/ui/shadcn/button";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

const period = computed(() => periodFromQuery(route.query.period));
const page = computed(() => pageFromQuery(route.query.page));
const events = useQuery(computed(() => orgEventsQuery(period.value, page.value)));

const periods: EventPeriod[] = ["upcoming", "past"];

// Upcoming and page 1 are the address without `period` and `page`; a tab opens on page 1.
function link(toPeriod: EventPeriod, toPage = 1) {
  return {
    path: routes.orgEvents,
    query: {
      ...(toPeriod === "past" ? { period: toPeriod } : {}),
      ...(toPage > 1 ? { page: toPage } : {}),
    },
  };
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
      <Button as-child>
        <RouterLink :to="routes.orgEventsNew">{{ t("create") }}</RouterLink>
      </Button>
    </div>

    <nav class="mt-4 flex flex-wrap gap-2" :aria-label="t('period')">
      <FilterLink
        v-for="value in periods"
        :key="value"
        :to="link(value)"
        :current="value === period"
      >
        {{ t(`periods.${value}`) }}
      </FilterLink>
    </nav>

    <QueryState
      v-slot="{ data: loaded }"
      class="mt-6"
      :query="events"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <p v-if="loaded.results.length === 0 && page > 1" class="text-muted-foreground">
        {{ t("pastEnd") }}
        <RouterLink class="underline" :to="link(period, eventPageCount(loaded.count))">
          {{ t("lastPage") }}
        </RouterLink>
      </p>
      <p v-else-if="loaded.results.length === 0" class="text-muted-foreground">
        {{ t(`empty.${period}`) }}
      </p>
      <ul v-else class="grid gap-3">
        <li v-for="event in loaded.results" :key="event.id">
          <Card>
            <CardHeader>
              <CardHeading :level="2" class="leading-snug wrap-anywhere">
                <RouterLink class="underline" :to="orgEventPath(event.id)">
                  {{ event.title }}
                </RouterLink>
              </CardHeading>
            </CardHeader>
            <CardContent class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground text-sm">
                {{ d(new Date(event.starts_at), "short") }} ·
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
      <PageNav
        class="mt-6"
        :page="page"
        :pages="eventPageCount(loaded.count)"
        :link="(toPage: number) => link(period, toPage)"
        :label="t('pages')"
      />
    </QueryState>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Мои события",
  "create": "Создать событие",
  "error": "Не удалось загрузить события",
  "refreshError": "Не удалось обновить события, показан прежний список",
  "pastEnd": "Здесь событий нет.",
  "lastPage": "К последней странице",
  "pages": "Страницы событий",
  "empty": {
    "upcoming": "Предстоящих событий нет",
    "past": "Прошедших событий нет"
  },
  "period": "Какие события показать",
  "periods": {
    "upcoming": "Предстоящие",
    "past": "Прошедшие"
  },
  "seats": "Занято {confirmed} из {capacity}",
  "waitlist": "в листе ожидания {count}",
  "checkin": "Чекин"
}
</i18n>
