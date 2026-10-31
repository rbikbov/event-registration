<script setup lang="ts">
import { useMutation } from "@tanstack/vue-query";
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { checkIn } from "../api/checkin";

type Answer = { kind: "checked_in"; name: string; maskedEmail: string } | { kind: "not_found" };

const { t } = useI18n({ useScope: "local" });
const route = useRoute();

const eventId = computed(() => Number(route.params.id));
const code = ref("");
const answer = ref<Answer | null>(null);
// The shadcn Input exposes no element, so the field is found inside its own wrapper.
const codeField = useTemplateRef<HTMLDivElement>("code-field");

// `autofocus` works once per document: on a second visit in the SPA it is ignored.
function focusCode(): void {
  codeField.value?.querySelector("input")?.focus();
}

onMounted(focusCode);

const { mutate, isPending, error, reset } = useMutation({
  mutationFn: (typed: string) => checkIn(eventId.value, typed),
  onSuccess: (result) => {
    show({ kind: "checked_in", name: result.name, maskedEmail: result.masked_email });
  },
  onError: (error) => {
    if (error instanceof AppError && error.kind === "not_found") {
      reset();
      show({ kind: "not_found" });
    }
  },
});

// The next participant is already in front of the desk: the field is ready for their code.
function show(next: Answer): void {
  answer.value = next;
  code.value = "";
  void nextTick(focusCode);
}

// Retrying helps only a failure of the request itself, not an ended session or a foreign event.
const failure = computed(() => {
  if (error.value === null) return null;
  if (error.value instanceof AppError && error.value.kind === "unauthorized") return "signedOut";
  if (error.value instanceof AppError && error.value.kind === "forbidden") return "foreign";
  return "failed";
});

function submit(): void {
  if (isPending.value || code.value.trim() === "") return;
  mutate(code.value);
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>

    <form class="mt-6 grid gap-2" novalidate @submit.prevent="submit">
      <Label for="code">{{ t("code") }}</Label>
      <div ref="code-field" class="flex gap-2">
        <Input
          id="code"
          v-model="code"
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
      <AlertDescription v-if="failure === 'signedOut'" class="flex items-center gap-4">
        {{ t("signedOut") }}
        <RouterLink class="underline" :to="routes.login">{{ t("signIn") }}</RouterLink>
      </AlertDescription>
      <AlertDescription v-else>{{ t(failure) }}</AlertDescription>
    </Alert>

    <div aria-live="polite" class="mt-6">
      <div
        v-if="answer?.kind === 'checked_in'"
        class="rounded-lg bg-green-600 p-6 text-white"
        data-answer="checked_in"
      >
        <p class="text-4xl font-bold">{{ t("checkedIn") }}</p>
        <p class="mt-2 text-xl">{{ answer.name }}</p>
        <p class="text-lg opacity-90">{{ answer.maskedEmail }}</p>
      </div>
      <div
        v-else-if="answer?.kind === 'not_found'"
        class="rounded-lg bg-red-600 p-6 text-white"
        data-answer="not_found"
      >
        <p class="text-4xl font-bold">{{ t("notFound") }}</p>
      </div>
    </div>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Чекин",
  "code": "Код билета",
  "submit": "Отметить",
  "checking": "Проверяем…",
  "failed": "Не удалось отметить, повторите",
  "signedOut": "Сессия истекла — войдите снова",
  "signIn": "Войти",
  "foreign": "Это событие другого организатора",
  "checkedIn": "Пропущен",
  "notFound": "Билет не найден"
}
</i18n>
