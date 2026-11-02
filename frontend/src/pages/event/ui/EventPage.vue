<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { publicEventLive, publicEventQuery, publicEventsQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { useLive } from "@/shared/lib/use-live";
import { QueryState } from "@/shared/ui/query-state";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { registerForEvent } from "../api/register";
import {
  parseRegistrationForm,
  serverRegistrationErrors,
  type RegistrationFormErrors,
  type RegistrationFormInput,
} from "../model/registration-form";

const { t, d } = useI18n({ useScope: "local" });
const route = useRoute();
const queryClient = useQueryClient();

// The route pattern admits digits only.
const eventId = computed(() => Number(route.params.id));
// Read once, then kept by the stream: a GET of its own (window focus, a remount of stale data, a
// refresh after the registration) could have read the event before a snapshot and answer after
// it with older free seats.
const event = useQuery(
  computed(() => ({
    ...publicEventQuery(eventId.value),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })),
);

// The stream opens once the event is there, so its first snapshot is read after that GET.
// Before it, 404 comes from the GET; EventSource does not tell it.
const eventLoaded = computed(() => event.data.value !== undefined);
useLive(
  () => (eventLoaded.value ? publicEventLive(eventId.value) : null),
  (snapshot) => queryClient.setQueryData(publicEventQuery(eventId.value).queryKey, snapshot),
);

const form = reactive<RegistrationFormInput>({ email: "", name: "" });
const clientErrors = ref<RegistrationFormErrors>({});

const {
  mutate,
  isPending: isSubmitting,
  error,
  data: result,
  reset,
} = useMutation({
  mutationFn: (values: RegistrationFormInput) => registerForEvent(eventId.value, values),
  // Only on success: a failed registration changed nothing. The free seats of this event come
  // with the snapshot of the registration; `exact` keeps the list from refreshing the event too,
  // which lives under its key.
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey, exact: true }),
});

// The router reuses this component when the id changes (history between two events): the
// result and the typed values belong to the previous event.
watch(eventId, () => {
  reset();
  form.email = "";
  form.name = "";
  clientErrors.value = {};
});

const fieldErrors = computed<RegistrationFormErrors>(() => ({
  ...(error.value instanceof AppError ? serverRegistrationErrors(error.value.fields) : {}),
  ...clientErrors.value,
}));

// A 400 without field codes, or any other failure, has no field to blame.
const submitError = computed(() => {
  if (!(error.value instanceof AppError)) return null;
  if (error.value.kind === "validation" && Object.keys(fieldErrors.value).length > 0) return null;
  return t("tryLater");
});

const resultText = computed(() => {
  if (result.value?.status !== "waitlisted") return t("confirmed");
  return result.value.position === undefined
    ? t("waitlistedNoPosition")
    : t("waitlisted", { position: result.value.position });
});

const notFound = computed(
  () => event.error.value instanceof AppError && event.error.value.kind === "not_found",
);

function submit(): void {
  const parsed = parseRegistrationForm(form);
  if (!parsed.ok) {
    clientErrors.value = parsed.errors;
    return;
  }
  clientErrors.value = {};
  mutate(parsed.values);
}

function startsAt(iso: string): string {
  return d(new Date(iso), { dateStyle: "long", timeStyle: "short" });
}

const fields: { name: "email" | "name"; type: string; autocomplete: string }[] = [
  { name: "email", type: "email", autocomplete: "email" },
  { name: "name", type: "text", autocomplete: "name" },
];
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <RouterLink class="text-muted-foreground text-sm underline" :to="routes.home">
      {{ t("back") }}
    </RouterLink>

    <Alert v-if="notFound" class="mt-6" role="alert">
      <AlertDescription>{{ t("notFound") }}</AlertDescription>
    </Alert>
    <QueryState
      v-else
      v-slot="{ data: loaded }"
      class="mt-4"
      :query="event"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <h1 class="text-2xl font-semibold wrap-anywhere">{{ loaded.title }}</h1>
      <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(loaded.starts_at) }}</p>
      <p v-if="loaded.description" class="mt-4 whitespace-pre-line wrap-anywhere">
        {{ loaded.description }}
      </p>
      <p class="mt-4 font-medium">
        {{ loaded.free_seats > 0 ? t("freeSeats", loaded.free_seats) : t("noSeats") }}
      </p>

      <Card class="mt-6">
        <CardHeader>
          <CardHeading :level="2">{{ t("register") }}</CardHeading>
        </CardHeader>
        <CardContent>
          <Alert v-if="result" role="status">
            <AlertDescription>
              {{ resultText }}
            </AlertDescription>
          </Alert>
          <form v-else class="grid gap-4" novalidate @submit.prevent="submit">
            <Alert v-if="submitError" variant="destructive" role="alert">
              <AlertDescription>{{ submitError }}</AlertDescription>
            </Alert>
            <div v-for="field in fields" :key="field.name" class="grid gap-2">
              <Label :for="field.name">{{ t(`fields.${field.name}`) }}</Label>
              <Input
                :id="field.name"
                v-model="form[field.name]"
                :type="field.type"
                :autocomplete="field.autocomplete"
                :aria-invalid="fieldErrors[field.name] !== undefined"
              />
              <p v-if="fieldErrors[field.name]" class="text-destructive text-sm">
                {{ t(`errors.${fieldErrors[field.name]}`) }}
              </p>
            </div>
            <Button type="submit" :disabled="isSubmitting">
              {{ isSubmitting ? t("submitting") : t("submit") }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </QueryState>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "back": "Все события",
  "error": "Не удалось загрузить событие",
  "refreshError": "Не удалось обновить событие, показаны прежние данные",
  "notFound": "Такого события нет",
  "freeSeats": "Свободно {count} место | Свободно {count} места | Свободно {count} мест",
  "noSeats": "Свободных мест нет, можно встать в лист ожидания",
  "register": "Регистрация",
  "fields": {
    "email": "Email",
    "name": "Имя"
  },
  "submit": "Зарегистрироваться",
  "submitting": "Отправляем…",
  "confirmed": "Место подтверждено",
  "waitlisted": "Вы в листе ожидания, №{position}",
  "waitlistedNoPosition": "Вы в листе ожидания",
  "tryLater": "Не удалось зарегистрироваться, попробуйте позже",
  "errors": {
    "required": "Обязательное поле",
    "blank": "Обязательное поле",
    "max_length": "Слишком длинное значение",
    "invalid": "Некорректное значение"
  }
}
</i18n>
