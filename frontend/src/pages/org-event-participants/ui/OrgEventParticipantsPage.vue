<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import type { OrgEvent } from "@/entities/event";
import { orgEventPath } from "@/shared/config";
import { QueryState } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

import { orgRegistrationsQuery, type OrgRegistration } from "../api/registrations";
import { countsChanged, pageCount, pageFromQuery } from "../model/participant-pages";
import {
  registrationStatuses,
  statusFilter,
  type RegistrationStatus,
} from "../model/status-filter";

// A tab of the event layout (pages/org-event): the layout reads the event and keeps it live.
const props = defineProps<{ event: OrgEvent }>();

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

const status = computed(() => statusFilter(route.query.status));
const page = computed(() => pageFromQuery(route.query.page));
const pages = computed(() => pageCount(props.event, status.value));

// The table is not read again on a snapshot: rows moving under the organizer's eyes are harder
// to follow than a notice. A page read at other counts than the event has now may be out of date.
const registrations = useQuery(
  computed(() =>
    orgRegistrationsQuery(props.event.id, status.value, page.value, () => props.event),
  ),
);
const hasUpdates = computed(() => {
  const loaded = registrations.data.value;
  return loaded !== undefined && countsChanged(loaded.counts, props.event);
});

function refresh(): void {
  void registrations.refetch();
}

const filters = [null, ...registrationStatuses];

// Page 1 is the address without `page`, as a filter link gives it.
function link(filter: RegistrationStatus | null, toPage = 1) {
  return {
    path: orgEventPath(props.event.id),
    query: { ...(filter ? { status: filter } : {}), ...(toPage > 1 ? { page: toPage } : {}) },
  };
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
  <section>
    <h2 class="sr-only">{{ t("participants") }}</h2>
    <nav class="mt-3 flex flex-wrap gap-2" :aria-label="t('filter')">
      <Button
        v-for="value in filters"
        :key="value ?? 'all'"
        :variant="value === status ? 'default' : 'outline'"
        size="sm"
        as-child
      >
        <RouterLink :to="link(value)" :aria-current="value === status ? 'true' : undefined">
          {{ t(`filters.${value ?? "all"}`) }}
        </RouterLink>
      </Button>
    </nav>

    <Alert v-if="hasUpdates" class="mt-4" role="status">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ t("updates") }}
        <Button
          variant="outline"
          size="sm"
          :disabled="registrations.isFetching.value"
          @click="refresh"
        >
          {{ registrations.isFetching.value ? t("refreshing") : t("refresh") }}
        </Button>
      </AlertDescription>
    </Alert>

    <QueryState
      v-slot="{ data: loaded }"
      class="mt-4"
      :query="registrations"
      :error-text="t('participantsError')"
      :refresh-error-text="t('participantsRefreshError')"
    >
      <p v-if="loaded.rows.length === 0 && page > 1" class="text-muted-foreground">
        {{ t("pastEnd") }}
        <RouterLink class="underline" :to="link(status, pages)">{{ t("lastPage") }}</RouterLink>
      </p>
      <p v-else-if="loaded.rows.length === 0" class="text-muted-foreground">
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
            <tr v-for="row in loaded.rows" :key="row.id" class="border-b">
              <td class="py-2 pr-4">{{ row.name }}</td>
              <td class="py-2 pr-4">{{ row.email }}</td>
              <td class="py-2 pr-4">{{ statusText(row) }}</td>
              <td class="py-2">{{ row.checked_in_at ? time(row.checked_in_at) : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </QueryState>

    <nav v-if="pages > 1" class="mt-4 flex items-center gap-3" :aria-label="t('pages')">
      <Button v-if="page > 1" variant="outline" size="sm" as-child>
        <RouterLink :to="link(status, page - 1)">{{ t("previous") }}</RouterLink>
      </Button>
      <span class="text-muted-foreground text-sm">{{ t("pageOf", { page, pages }) }}</span>
      <Button v-if="page < pages" variant="outline" size="sm" as-child>
        <RouterLink :to="link(status, page + 1)">{{ t("next") }}</RouterLink>
      </Button>
    </nav>
  </section>
</template>

<i18n lang="json" locale="ru">
{
  "participants": "Участники",
  "filter": "Фильтр по статусу",
  "filters": {
    "all": "Все",
    "confirmed": "Подтверждены",
    "waitlisted": "Лист ожидания",
    "cancelled": "Отказались"
  },
  "updates": "Есть обновления",
  "refresh": "Обновить",
  "refreshing": "Обновляем…",
  "pages": "Страницы участников",
  "pageOf": "Страница {page} из {pages}",
  "previous": "Назад",
  "next": "Вперёд",
  "pastEnd": "На этой странице никого нет.",
  "lastPage": "К последней странице",
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
