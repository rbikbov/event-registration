<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { orgEventQuery, orgEventLive, type OrgEvent } from "@/entities/event";
import { AppError } from "@/shared/api";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { useLive } from "@/shared/lib/use-live";
import { QueryState } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

import { orgRegistrationsQuery, type OrgRegistration } from "../api/registrations";
import { registrationStatuses, statusFilter } from "../model/status-filter";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

// The route pattern admits digits only.
const eventId = computed(() => Number(route.params.id));
const status = computed(() => statusFilter(route.query.status));

// Read once, then kept by the stream: a GET of its own (window focus, a remount of stale data)
// could have read the event before a snapshot and answer after it with older counts.
const event = useQuery(
  computed(() => ({
    ...orgEventQuery(eventId.value),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })),
);
const registrations = useQuery(computed(() => orgRegistrationsQuery(eventId.value, status.value)));

// The stream opens once the event is there, so its first snapshot is read after that GET.
// Before it, 403 and 404 come from the GET, which says which one it is; EventSource does not.
const eventLoaded = computed(() => event.data.value !== undefined);
const queryClient = useQueryClient();
useLive(
  () => (eventLoaded.value ? orgEventLive(eventId.value) : null),
  (snapshot) => {
    const { queryKey } = orgEventQuery(eventId.value);
    // The panel never reads the event itself, but the check-in screen shares its cache: a GET
    // it started may have read the event before this snapshot. Cancelled, it cannot answer.
    void queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData(queryKey, snapshot);
  },
);

// Not found and someone else's event are answers, not failures: retrying changes nothing.
const loadAnswer = computed(() => {
  const error = event.error.value;
  if (!(error instanceof AppError)) return null;
  if (error.kind === "not_found") return "notFound";
  if (error.kind === "forbidden") return "foreign";
  return null;
});

function counters(loaded: OrgEvent) {
  return [
    { key: "capacity", value: loaded.capacity },
    { key: "confirmed", value: loaded.confirmed },
    { key: "waitlisted", value: loaded.waitlisted },
    { key: "checkedIn", value: loaded.checked_in },
    { key: "freeSeats", value: loaded.free_seats },
  ];
}

const filters = [null, ...registrationStatuses];

function filterLink(value: (typeof filters)[number]) {
  return { path: orgEventPath(eventId.value), query: value ? { status: value } : {} };
}

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "long", timeStyle: "short" });
}

function time(iso: string): string {
  return d(new Date(iso), { timeStyle: "short" });
}

function statusText(row: OrgRegistration): string {
  if (row.status === "waitlisted" && row.position !== undefined) {
    return t("status.waitlistedAt", { position: row.position });
  }
  return t(`status.${row.status}`);
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8">
    <RouterLink class="text-muted-foreground text-sm underline" :to="routes.orgEvents">
      {{ t("back") }}
    </RouterLink>

    <Alert v-if="loadAnswer" class="mt-6" role="alert">
      <AlertDescription>{{ t(loadAnswer) }}</AlertDescription>
    </Alert>
    <QueryState
      v-else
      v-slot="{ data: loaded }"
      class="mt-6"
      :query="event"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">{{ loaded.title }}</h1>
          <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(loaded.starts_at) }}</p>
        </div>
        <Button as-child>
          <RouterLink :to="checkinPath(loaded.id)">{{ t("checkin") }}</RouterLink>
        </Button>
      </div>

      <dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          v-for="counter in counters(loaded)"
          :key="counter.key"
          class="rounded-lg border p-4"
          :data-counter="counter.key"
        >
          <dt class="text-muted-foreground text-sm">{{ t(`counters.${counter.key}`) }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ counter.value }}</dd>
        </div>
      </dl>

      <h2 class="mt-8 text-lg font-semibold">{{ t("participants") }}</h2>
      <nav class="mt-3 flex flex-wrap gap-2" :aria-label="t('filter')">
        <Button
          v-for="value in filters"
          :key="value ?? 'all'"
          :variant="value === status ? 'default' : 'outline'"
          size="sm"
          as-child
        >
          <RouterLink :to="filterLink(value)" :aria-current="value === status ? 'true' : undefined">
            {{ t(`filters.${value ?? "all"}`) }}
          </RouterLink>
        </Button>
      </nav>

      <QueryState
        v-slot="{ data: rows }"
        class="mt-4"
        :query="registrations"
        :error-text="t('participantsError')"
        :refresh-error-text="t('participantsRefreshError')"
      >
        <p v-if="rows.length === 0" class="text-muted-foreground">
          {{ status ? t("emptyFiltered") : t("empty") }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-muted-foreground border-b">
              <tr>
                <th class="py-2 pr-4 font-medium">{{ t("columns.name") }}</th>
                <th class="py-2 pr-4 font-medium">{{ t("columns.email") }}</th>
                <th class="py-2 pr-4 font-medium">{{ t("columns.status") }}</th>
                <th class="py-2 font-medium">{{ t("columns.checkedIn") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="border-b">
                <td class="py-2 pr-4">{{ row.name }}</td>
                <td class="py-2 pr-4">{{ row.email }}</td>
                <td class="py-2 pr-4">{{ statusText(row) }}</td>
                <td class="py-2">{{ row.checked_in_at ? time(row.checked_in_at) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </QueryState>
    </QueryState>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "back": "Мои события",
  "error": "Не удалось загрузить событие",
  "refreshError": "Не удалось обновить событие, показаны прежние данные",
  "notFound": "Событие не найдено",
  "foreign": "Это событие другого организатора",
  "checkin": "Чекин",
  "counters": {
    "capacity": "Мест",
    "confirmed": "Подтверждено",
    "waitlisted": "В листе ожидания",
    "checkedIn": "Пришло",
    "freeSeats": "Свободно"
  },
  "participants": "Участники",
  "filter": "Фильтр по статусу",
  "filters": {
    "all": "Все",
    "confirmed": "Подтверждены",
    "waitlisted": "Лист ожидания",
    "cancelled": "Отказались"
  },
  "participantsError": "Не удалось загрузить участников",
  "participantsRefreshError": "Не удалось обновить участников, показан прежний список",
  "empty": "Регистраций пока нет",
  "emptyFiltered": "С таким статусом никого нет",
  "columns": {
    "name": "Имя",
    "email": "Email",
    "status": "Статус",
    "checkedIn": "Отметка на входе"
  },
  "status": {
    "confirmed": "Подтверждён",
    "waitlisted": "В листе ожидания",
    "waitlistedAt": "В листе ожидания, №{position}",
    "cancelled": "Отказался"
  }
}
</i18n>
