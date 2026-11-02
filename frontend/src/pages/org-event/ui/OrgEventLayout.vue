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

// The event of the organizer: read and kept live here, once for every tab under it, so switching
// tabs keeps the stream. Nothing of the event is shown before its GET has answered: until then it
// may be someone else's. The participants get the loaded event as the `event` prop; the check-in
// form needs none and stays usable when the load fails for another reason.
const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

// The route pattern admits digits only.
const eventId = computed(() => Number(route.params.id));
const onCheckin = computed(() => route.path === checkinPath(eventId.value));

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

// The stream opens once the event is there, so its first snapshot is read after that GET.
// Before it, 403 and 404 come from the GET, which says which one it is; EventSource does not.
const eventLoaded = computed(() => event.data.value !== undefined);
const queryClient = useQueryClient();
useLive(
  () => (eventLoaded.value ? orgEventLive(eventId.value) : null),
  (snapshot) => queryClient.setQueryData(orgEventQuery(eventId.value).queryKey, snapshot),
);

// Not found and someone else's event are answers, not failures: retrying changes nothing.
const loadAnswer = computed(() => {
  const error = event.error.value;
  if (!(error instanceof AppError)) return null;
  if (error.kind === "not_found") return "notFound";
  if (error.kind === "forbidden") return "foreign";
  return null;
});

const tabs = computed(() => [
  { key: "participants", to: orgEventPath(eventId.value), current: !onCheckin.value },
  { key: "checkin", to: checkinPath(eventId.value), current: onCheckin.value },
]);

// At the entrance the header is one line: the form below it is what the organizer looks at.
function counters(loaded: OrgEvent) {
  if (onCheckin.value) {
    return [
      { key: "checkedIn", value: loaded.checked_in },
      { key: "confirmed", value: loaded.confirmed },
    ];
  }
  return [
    { key: "capacity", value: loaded.capacity },
    { key: "confirmed", value: loaded.confirmed },
    { key: "waitlisted", value: loaded.waitlisted },
    { key: "checkedIn", value: loaded.checked_in },
    { key: "freeSeats", value: loaded.free_seats },
  ];
}

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "long", timeStyle: "short" });
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
    <template v-else>
      <QueryState
        v-slot="{ data: loaded }"
        class="mt-6"
        :query="event"
        :error-text="onCheckin ? t('checkinError') : t('error')"
        :refresh-error-text="onCheckin ? t('checkinRefreshError') : t('refreshError')"
      >
        <div
          v-if="onCheckin"
          class="flex flex-wrap items-baseline gap-x-6 gap-y-2"
          data-header="compact"
        >
          <h1 class="text-xl font-semibold">{{ loaded.title }}</h1>
          <dl class="flex gap-4 text-sm">
            <div
              v-for="counter in counters(loaded)"
              :key="counter.key"
              class="flex gap-1"
              :data-counter="counter.key"
            >
              <dt class="text-muted-foreground">{{ t(`counters.${counter.key}`) }}</dt>
              <dd class="font-semibold">{{ counter.value }}</dd>
            </div>
          </dl>
        </div>
        <template v-else>
          <h1 class="text-2xl font-semibold">{{ loaded.title }}</h1>
          <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(loaded.starts_at) }}</p>
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
        </template>
      </QueryState>

      <template v-if="!event.isPending.value">
        <nav class="mt-6 flex gap-2 border-b pb-2" :aria-label="t('tabs')">
          <Button
            v-for="tab in tabs"
            :key="tab.key"
            :variant="tab.current ? 'default' : 'ghost'"
            size="sm"
            as-child
          >
            <RouterLink :to="tab.to" :aria-current="tab.current ? 'page' : undefined">
              {{ t(`tab.${tab.key}`) }}
            </RouterLink>
          </Button>
        </nav>

        <!-- The check-in form works without the event once the GET has answered with something
           other than 403/404: the title above is only a label. -->
        <RouterView v-if="onCheckin" />
        <RouterView v-else-if="event.data.value" class="mt-6" :event="event.data.value" />
      </template>
    </template>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "back": "Мои события",
  "error": "Не удалось загрузить событие",
  "refreshError": "Не удалось обновить событие, показаны прежние данные",
  "checkinError": "Не удалось загрузить событие, чекин работает",
  "checkinRefreshError": "Не удалось обновить событие, чекин работает",
  "notFound": "Событие не найдено",
  "foreign": "Это событие другого организатора",
  "tabs": "Разделы события",
  "tab": {
    "participants": "Участники",
    "checkin": "Чекин"
  },
  "counters": {
    "capacity": "Мест",
    "confirmed": "Подтверждено",
    "waitlisted": "В листе ожидания",
    "checkedIn": "Пришло",
    "freeSeats": "Свободно"
  }
}
</i18n>
