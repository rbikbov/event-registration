<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { publicEventsQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { eventPath } from "@/shared/config";
import { QueryState } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

import { cancelTicket, ticketQuery } from "../api/ticket";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();
const queryClient = useQueryClient();

const token = computed(() => String(route.params.token));
const query = computed(() => ticketQuery(token.value));
const ticket = useQuery(query);

const confirming = ref(false);
const {
  mutate,
  isPending: isCancelling,
  isError: cancelFailed,
  reset,
} = useMutation({
  mutationFn: () => cancelTicket(token.value),
  onSuccess: async (result) => {
    confirming.value = false;
    // The cancel answer is already the new status: if the reread below fails, the page must not
    // keep showing the code of a cancelled ticket.
    queryClient.setQueryData(
      query.value.queryKey,
      // A cancelled ticket is never checked in: the backend refuses to cancel one that is.
      (old) =>
        old && { status: result.status, name: old.name, checked_in_at: null, event: old.event },
    );
    await queryClient.invalidateQueries({ queryKey: query.value.queryKey });
    // A freed seat changes the free seats of the event and of the list.
    await queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey });
  },
  // 409: the ticket was checked in while the page was open. Not a failure: the reread shows it.
  onError: async (error) => {
    if (!(error instanceof AppError) || error.kind !== "conflict") return;
    confirming.value = false;
    reset();
    await queryClient.invalidateQueries({ queryKey: query.value.queryKey });
  },
});

// The router reuses this component for another token: the open confirmation is not its own.
watch(token, () => {
  confirming.value = false;
  reset();
});

const notFound = computed(
  () => ticket.error.value instanceof AppError && ticket.error.value.kind === "not_found",
);

function stopConfirming(): void {
  confirming.value = false;
  reset();
}

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "long", timeStyle: "short" });
}

function time(iso: string): string {
  return d(new Date(iso), { timeStyle: "short" });
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <Alert v-if="notFound" role="alert">
      <AlertDescription>{{ t("notFound") }}</AlertDescription>
    </Alert>
    <!-- A failed reread keeps the data: the code must stay on screen at the entrance. -->
    <QueryState
      v-else
      v-slot="{ data: loaded }"
      :query="ticket"
      :error-text="t('error')"
      :refresh-error-text="t('refreshFailed')"
    >
      <Card>
        <CardHeader>
          <CardHeading :level="1" class="text-2xl">{{ loaded.event.title }}</CardHeading>
          <p class="text-muted-foreground text-sm">{{ startsAt(loaded.event.starts_at) }}</p>
        </CardHeader>
        <CardContent class="grid gap-4">
          <p>{{ loaded.name }}</p>

          <template v-if="loaded.status === 'confirmed'">
            <p class="text-muted-foreground text-sm">{{ t("code") }}</p>
            <p class="font-mono text-4xl font-semibold tracking-widest" data-ticket-code>
              {{ loaded.ticket_code }}
            </p>
            <p v-if="loaded.checked_in_at" class="font-medium">
              {{ t("checkedIn", { time: time(loaded.checked_in_at) }) }}
            </p>
          </template>
          <p v-else-if="loaded.status === 'waitlisted'" class="font-medium">
            {{ t("waitlisted", { position: loaded.position ?? "" }) }}
          </p>
          <template v-else>
            <p class="font-medium">{{ t("cancelled") }}</p>
            <RouterLink class="underline" :to="eventPath(loaded.event.id)">
              {{ t("registerAgain") }}
            </RouterLink>
          </template>

          <!-- A checked-in holder has taken the seat: the backend refuses to cancel it. -->
          <template v-if="loaded.status !== 'cancelled' && !loaded.checked_in_at">
            <Alert v-if="cancelFailed" variant="destructive" role="alert">
              <AlertDescription>{{ t("cancelFailed") }}</AlertDescription>
            </Alert>
            <div v-if="confirming" class="grid gap-2">
              <p>{{ t("confirmQuestion") }}</p>
              <div class="flex gap-2">
                <Button variant="destructive" :disabled="isCancelling" @click="mutate()">
                  {{ isCancelling ? t("cancelling") : t("confirmYes") }}
                </Button>
                <Button variant="outline" :disabled="isCancelling" @click="stopConfirming">
                  {{ t("confirmNo") }}
                </Button>
              </div>
            </div>
            <Button v-else variant="outline" class="justify-self-start" @click="confirming = true">
              {{ t("cancel") }}
            </Button>
          </template>
        </CardContent>
      </Card>
    </QueryState>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "error": "Не удалось загрузить билет",
  "refreshFailed": "Не удалось обновить билет",
  "notFound": "Билет не найден",
  "code": "Код билета",
  "checkedIn": "Вы отмечены на входе в {time}",
  "waitlisted": "Вы в листе ожидания, №{position}",
  "cancelled": "Регистрация отменена",
  "registerAgain": "Зарегистрироваться снова",
  "cancel": "Отказаться",
  "confirmQuestion": "Отказаться от регистрации?",
  "confirmYes": "Да, отказаться",
  "confirmNo": "Нет",
  "cancelling": "Отменяем…",
  "cancelFailed": "Не удалось отказаться, попробуйте позже"
}
</i18n>
