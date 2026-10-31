<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { orgEventQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { orgEventPath } from "@/shared/config";
import { RetryAlert } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { checkIn } from "../api/checkin";

type Answer =
  | { kind: "checked_in"; name: string; maskedEmail: string }
  | { kind: "already_checked_in"; name: string; checkedInAt: string }
  | { kind: "not_found" }
  | { kind: "not_confirmed" };

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();

const eventId = computed(() => Number(route.params.id));
const {
  data: event,
  error: loadError,
  isError: loadFailed,
  isFetching,
  refetch,
} = useQuery(computed(() => orgEventQuery(eventId.value)));

// A missing or someone else's event takes the place of the form: every code would be "not
// found" or "foreign". Any other load failure leaves the form working, the title is only a label,
// so the screen keeps its own markup instead of QueryState, which hides content until data.
const eventAnswer = computed(() => {
  if (!(loadError.value instanceof AppError)) return null;
  if (loadError.value.kind === "not_found") return "eventNotFound";
  if (loadError.value.kind === "forbidden") return "foreign";
  return null;
});

const code = ref("");
const answer = ref<Answer | null>(null);
// shadcn Input and Button expose no element, so each is found inside its own wrapper.
const codeField = useTemplateRef<HTMLDivElement>("code-field");
const answerPanel = useTemplateRef<HTMLDivElement>("answer-panel");

// `autofocus` works once per document: on a second visit in the SPA it is ignored.
function focusCode(): void {
  codeField.value?.querySelector("input")?.focus();
}

onMounted(focusCode);

const { mutate, isPending, error, reset } = useMutation({
  mutationFn: (typed: string) => checkIn(eventId.value, typed),
  onSuccess: (result) => {
    show(
      result.result === "checked_in"
        ? { kind: "checked_in", name: result.name, maskedEmail: result.masked_email }
        : { kind: "already_checked_in", name: result.name, checkedInAt: result.checked_in_at },
    );
  },
  // A missing or unconfirmed ticket is an answer about the ticket, not a failed request.
  onError: (error) => {
    if (!(error instanceof AppError)) return;
    if (error.kind === "not_found") {
      reset();
      show({ kind: "not_found" });
    } else if (error.kind === "conflict") {
      reset();
      show({ kind: "not_confirmed" });
    }
  },
});

// The answer takes the place of the form until the organizer moves on, so it is never read as
// the answer to the next code. "Next" gets the focus: Enter takes the organizer back to the field.
function show(next: Answer): void {
  answer.value = next;
  code.value = "";
  void nextTick(() => answerPanel.value?.querySelector("button")?.focus());
}

function next(): void {
  answer.value = null;
  void nextTick(focusCode);
}

// Retrying cannot help with a foreign event. An ended session (401) never shows here: the app
// sends the organizer to sign in (app/session-expiry.ts).
const failure = computed(() => {
  if (error.value === null) return null;
  if (error.value instanceof AppError && error.value.kind === "forbidden") return "foreign";
  if (error.value instanceof AppError && error.value.kind === "network") return "offline";
  return "failed";
});

function time(iso: string): string {
  return d(new Date(iso), { timeStyle: "short" });
}

function submit(): void {
  if (isPending.value || code.value.trim() === "") return;
  mutate(code.value);
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <RouterLink
      v-if="event"
      class="text-muted-foreground text-sm underline"
      :to="orgEventPath(event.id)"
    >
      {{ t("back") }}
    </RouterLink>
    <h1 class="text-2xl font-semibold">
      {{ event ? t("titleOf", { title: event.title }) : t("title") }}
    </h1>

    <Alert v-if="eventAnswer" class="mt-6" role="alert">
      <AlertDescription>{{ t(eventAnswer) }}</AlertDescription>
    </Alert>
    <template v-else>
      <RetryAlert
        v-if="loadFailed"
        class="mt-6"
        :text="event ? t('eventRefreshError') : t('eventError')"
        :fetching="isFetching"
        @retry="refetch()"
      />

      <div v-if="answer" ref="answer-panel" aria-live="polite" class="mt-6 grid gap-4">
        <div
          v-if="answer.kind === 'checked_in'"
          class="rounded-lg bg-green-600 p-6 text-white"
          data-answer="checked_in"
        >
          <p class="text-4xl font-bold">{{ t("checkedIn") }}</p>
          <p class="mt-2 text-xl">{{ answer.name }}</p>
          <p class="text-lg opacity-90">{{ answer.maskedEmail }}</p>
        </div>
        <div
          v-else-if="answer.kind === 'already_checked_in'"
          class="rounded-lg bg-yellow-400 p-6 text-black"
          data-answer="already_checked_in"
        >
          <p class="text-4xl font-bold">
            {{ t("alreadyCheckedIn", { time: time(answer.checkedInAt) }) }}
          </p>
          <p class="mt-2 text-xl">{{ answer.name }}</p>
        </div>
        <div v-else class="rounded-lg bg-red-600 p-6 text-white" :data-answer="answer.kind">
          <p class="text-4xl font-bold">
            {{ answer.kind === "not_found" ? t("notFound") : t("notConfirmed") }}
          </p>
        </div>
        <Button size="lg" @click="next">{{ t("next") }}</Button>
      </div>

      <form v-else class="mt-6 grid gap-2" novalidate @submit.prevent="submit">
        <Label for="code">{{ t("code") }}</Label>
        <div ref="code-field" class="flex gap-2">
          <Input
            id="code"
            v-model="code"
            :readonly="isPending"
            autocomplete="off"
            autocapitalize="characters"
            class="font-mono text-lg tracking-widest uppercase"
          />
          <Button type="submit" :disabled="isPending || code.trim() === ''">
            {{ isPending ? t("checking") : t("submit") }}
          </Button>
        </div>
      </form>

      <Alert v-if="failure" variant="destructive" class="mt-6" role="alert">
        <AlertDescription>{{ t(failure) }}</AlertDescription>
      </Alert>
    </template>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Чекин",
  "titleOf": "Чекин: {title}",
  "back": "Панель события",
  "eventNotFound": "Событие не найдено",
  "eventError": "Не удалось загрузить название события, чекин работает",
  "eventRefreshError": "Не удалось обновить событие, чекин работает",
  "code": "Код билета",
  "submit": "Отметить",
  "checking": "Проверяем…",
  "failed": "Не удалось отметить, повторите",
  "foreign": "Это событие другого организатора",
  "offline": "Нет связи, повторите",
  "checkedIn": "Пропущен",
  "alreadyCheckedIn": "Уже отмечен в {time}",
  "notFound": "Билет не найден",
  "notConfirmed": "Билет не подтверждён: лист ожидания или отказ",
  "next": "Следующий"
}
</i18n>
