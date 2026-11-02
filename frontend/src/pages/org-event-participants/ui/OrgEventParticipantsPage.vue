<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import type { OrgEvent } from "@/entities/event";
import { orgEventPath } from "@/shared/config";
import { QueryState } from "@/shared/ui/query-state";
import { Button } from "@/shared/ui/shadcn/button";

import { orgRegistrationsQuery, type OrgRegistration } from "../api/registrations";
import { registrationStatuses, statusFilter } from "../model/status-filter";

// A tab of the event layout (pages/org-event): the layout reads the event and keeps it live.
const props = defineProps<{ event: OrgEvent }>();

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

const status = computed(() => statusFilter(route.query.status));
const registrations = useQuery(computed(() => orgRegistrationsQuery(props.event.id, status.value)));

const filters = [null, ...registrationStatuses];

function filterLink(value: (typeof filters)[number]) {
  return { path: orgEventPath(props.event.id), query: value ? { status: value } : {} };
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
