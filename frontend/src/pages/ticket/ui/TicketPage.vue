<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { publicEventsQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { eventPath } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";

import { cancelTicket, ticketQuery } from "../api/ticket";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();
const queryClient = useQueryClient();

const token = computed(() => String(route.params.token));
const query = computed(() => ticketQuery(token.value));
const { data: ticket, isPending, isError, error: loadError, refetch } = useQuery(query);

const confirming = ref(false);
const {
  mutate,
  isPending: isCancelling,
  isError: cancelFailed,
  reset,
} = useMutation({
  mutationFn: () => cancelTicket(token.value),
  onSuccess: async () => {
    confirming.value = false;
    await queryClient.invalidateQueries({ queryKey: query.value.queryKey });
    // A freed seat changes the free seats of the event and of the list.
    await queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey });
  },
});

// The router reuses this component for another token: the open confirmation is not its own.
watch(token, () => {
  confirming.value = false;
  reset();
});

const notFound = computed(
  () => loadError.value instanceof AppError && loadError.value.kind === "not_found",
);

function stopConfirming(): void {
  confirming.value = false;
  reset();
}

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "long", timeStyle: "short" });
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <p v-if="isPending" class="text-muted-foreground" role="status">{{ t("loading") }}</p>
    <Alert v-else-if="notFound" role="alert">
      <AlertDescription>{{ t("notFound") }}</AlertDescription>
    </Alert>
    <Alert v-else-if="isError" variant="destructive" role="alert">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ t("error") }}
        <Button variant="outline" size="sm" @click="refetch()">{{ t("retry") }}</Button>
      </AlertDescription>
    </Alert>
    <Card v-else-if="ticket">
      <CardHeader>
        <!-- CardTitle is always an h3; the event title is the heading of the page. -->
        <h1 class="text-2xl leading-none font-semibold">{{ ticket.event.title }}</h1>
        <p class="text-muted-foreground text-sm">{{ startsAt(ticket.event.starts_at) }}</p>
      </CardHeader>
      <CardContent class="grid gap-4">
        <p>{{ ticket.name }}</p>

        <template v-if="ticket.status === 'confirmed'">
          <p class="text-muted-foreground text-sm">{{ t("code") }}</p>
          <p class="font-mono text-4xl font-semibold tracking-widest" data-ticket-code>
            {{ ticket.ticket_code }}
          </p>
        </template>
        <p v-else-if="ticket.status === 'waitlisted'" class="font-medium">
          {{
            ticket.position === undefined
              ? t("waitlistedNoPosition")
              : t("waitlisted", { position: ticket.position })
          }}
        </p>
        <template v-else>
          <p class="font-medium">{{ t("cancelled") }}</p>
          <RouterLink class="underline" :to="eventPath(ticket.event.id)">
            {{ t("registerAgain") }}
          </RouterLink>
        </template>

        <template v-if="ticket.status !== 'cancelled'">
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
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "loading": "Загружаем…",
  "error": "Не удалось загрузить билет",
  "retry": "Повторить",
  "notFound": "Билет не найден",
  "code": "Код билета",
  "waitlisted": "Вы в листе ожидания, №{position}",
  "waitlistedNoPosition": "Вы в листе ожидания",
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
