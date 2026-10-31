<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { orgEventQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

import { orgRegistrationsQuery, type OrgRegistration } from "../api/registrations";
import { registrationStatuses, statusFilter } from "../model/status-filter";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

// The route pattern admits digits only.
const eventId = computed(() => Number(route.params.id));
const status = computed(() => statusFilter(route.query.status));

const {
  data: event,
  isPending,
  isError,
  error: loadError,
  refetch,
} = useQuery(computed(() => orgEventQuery(eventId.value)));
const registrations = useQuery(computed(() => orgRegistrationsQuery(eventId.value, status.value)));

// Not found and someone else's event are answers, not failures: retrying changes nothing.
const loadAnswer = computed(() => {
  if (!(loadError.value instanceof AppError)) return null;
  if (loadError.value.kind === "not_found") return "notFound";
  if (loadError.value.kind === "forbidden") return "foreign";
  return null;
});

const counters = computed(() =>
  event.value
    ? [
        { key: "capacity", value: event.value.capacity },
        { key: "confirmed", value: event.value.confirmed },
        { key: "waitlisted", value: event.value.waitlisted },
        { key: "checkedIn", value: event.value.checked_in },
        { key: "freeSeats", value: event.value.free_seats },
      ]
    : [],
);

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

    <p v-if="isPending" class="text-muted-foreground mt-6" role="status">{{ t("loading") }}</p>
    <Alert v-else-if="loadAnswer" class="mt-6" role="alert">
      <AlertDescription>{{ t(loadAnswer) }}</AlertDescription>
    </Alert>
    <Alert v-else-if="isError" variant="destructive" class="mt-6" role="alert">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ t("error") }}
        <Button variant="outline" size="sm" @click="refetch()">{{ t("retry") }}</Button>
      </AlertDescription>
    </Alert>
    <template v-else-if="event">
      <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">{{ event.title }}</h1>
          <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(event.starts_at) }}</p>
        </div>
        <Button as-child>
          <RouterLink :to="checkinPath(event.id)">{{ t("checkin") }}</RouterLink>
        </Button>
      </div>

      <dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          v-for="counter in counters"
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

      <p v-if="registrations.isPending.value" class="text-muted-foreground mt-4" role="status">
        {{ t("loading") }}
      </p>
      <Alert
        v-else-if="registrations.isError.value"
        variant="destructive"
        class="mt-4"
        role="alert"
      >
        <AlertDescription class="flex items-center justify-between gap-4">
          {{ t("participantsError") }}
          <Button variant="outline" size="sm" @click="registrations.refetch()">
            {{ t("retry") }}
          </Button>
        </AlertDescription>
      </Alert>
      <p v-else-if="registrations.data.value?.length === 0" class="text-muted-foreground mt-4">
        {{ status ? t("emptyFiltered") : t("empty") }}
      </p>
      <div v-else-if="registrations.data.value" class="mt-4 overflow-x-auto">
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
            <tr v-for="row in registrations.data.value" :key="row.id" class="border-b">
              <td class="py-2 pr-4">{{ row.name }}</td>
              <td class="py-2 pr-4">{{ row.email }}</td>
              <td class="py-2 pr-4">{{ statusText(row) }}</td>
              <td class="py-2">{{ row.checked_in_at ? time(row.checked_in_at) : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "back": "Мои события",
  "loading": "Загружаем…",
  "error": "Не удалось загрузить событие",
  "retry": "Повторить",
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
