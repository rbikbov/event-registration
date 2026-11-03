<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { orgEventLive, orgEventProbe, orgEventQuery, type OrgEvent } from "@/entities/event";
import { AppError } from "@/shared/api";
import { checkinPath, orgEventEditPath, orgEventPath, routes } from "@/shared/config";
import { useLive } from "@/shared/lib/use-live";
import { QueryState } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

// The event of the organizer: read and kept live here, once for every tab under it, so switching
// tabs keeps the stream. Nothing of the event is shown before its GET has answered: until then it
// may be someone else's. The participants and the edit form get the loaded event as the `event`
// prop; the check-in form needs none and stays usable when the load fails for another reason.
const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

// The route pattern admits digits only.
const eventId = computed(() => Number(route.params.id));
// By the matched record, not the path: the router also matches an address with a trailing slash.
const tabRoute = computed(() => route.matched.at(-1)?.path);
const onCheckin = computed(() => tabRoute.value === routes.orgCheckin);

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

// Not found and someone else's event are answers, not failures: retrying changes nothing.
function answerOf(error: unknown) {
  if (!(error instanceof AppError)) return null;
  if (error.kind === "not_found") return "notFound";
  if (error.kind === "forbidden") return "foreign";
  return null;
}

// The answer of a probe after a refused stream: the event may have gone since the GET.
const streamAnswer = ref<ReturnType<typeof answerOf>>(null);
watch(eventId, () => (streamAnswer.value = null));
const loadAnswer = computed(() => answerOf(event.error.value) ?? streamAnswer.value);

// The stream opens once the event is there, so its first snapshot is read after that GET.
// Before it, 403 and 404 come from the GET, which says which one it is; EventSource does not.
const eventLoaded = computed(() => event.data.value !== undefined);
const queryClient = useQueryClient();
const { reconnecting } = useLive(
  () => (eventLoaded.value && !loadAnswer.value ? orgEventLive(eventId.value) : null),
  (snapshot) => queryClient.setQueryData(orgEventQuery(eventId.value).queryKey, snapshot),
  { onRefused: () => void probe(eventId.value) },
);

// EventSource does not tell why it was refused, so the event is read again for its status: 401
// is the app's to handle (an ended session goes to /login), 403 and 404 end the stream and show
// as the GET's would. Anything else (the backend is down) leaves the stream to be opened again.
async function probe(id: number) {
  try {
    await queryClient.fetchQuery(orgEventProbe(id));
  } catch (error) {
    if (id === eventId.value) streamAnswer.value = answerOf(error);
  }
}

const tabs = computed(() =>
  [
    { key: "participants", to: orgEventPath(eventId.value), route: routes.orgEvent },
    { key: "checkin", to: checkinPath(eventId.value), route: routes.orgCheckin },
    { key: "edit", to: orgEventEditPath(eventId.value), route: routes.orgEventEdit },
  ].map((tab) => ({ ...tab, current: tab.route === tabRoute.value })),
);

function counters(loaded: OrgEvent) {
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
  <div class="mx-auto max-w-4xl">
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
        <h1 class="text-2xl font-semibold wrap-anywhere">{{ loaded.title }}</h1>
        <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(loaded.starts_at) }}</p>
        <!-- Until the next snapshot the counters may be stale: changes meanwhile are not seen. -->
        <Alert v-if="reconnecting" class="mt-4" role="status" data-live="reconnecting">
          <AlertDescription>{{ t("reconnecting") }}</AlertDescription>
        </Alert>
        <!-- Narrow screens get the counters as text, one per line; wider ones get cards. -->
        <dl class="mt-6 grid sm:grid-cols-5 sm:gap-3">
          <div
            v-for="counter in counters(loaded)"
            :key="counter.key"
            class="flex items-baseline gap-x-2 sm:flex-col sm:rounded-lg sm:border sm:p-2 md:p-3 xl:p-4"
            :data-counter="counter.key"
          >
            <dt class="text-muted-foreground text-sm">{{ t(`counters.${counter.key}`) }}</dt>
            <dd class="font-semibold sm:mt-auto sm:text-2xl">{{ counter.value }}</dd>
          </div>
        </dl>
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
  </div>
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
  "reconnecting": "Соединение потеряно, переподключаюсь…",
  "tabs": "Разделы события",
  "tab": {
    "participants": "Участники",
    "checkin": "Чекин",
    "edit": "Редактирование"
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
