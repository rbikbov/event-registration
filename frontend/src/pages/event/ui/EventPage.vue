<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { publicEventQuery, publicEventsQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/shadcn/card";
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
const eventQuery = computed(() => publicEventQuery(eventId.value));
const { data: event, isPending, isError, error: loadError, refetch } = useQuery(eventQuery);

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
  onSettled: async () => {
    await queryClient.invalidateQueries({ queryKey: eventQuery.value.queryKey });
    await queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey });
  },
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
  () => loadError.value instanceof AppError && loadError.value.kind === "not_found",
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

    <p v-if="isPending" class="text-muted-foreground mt-6" role="status">{{ t("loading") }}</p>
    <Alert v-else-if="notFound" class="mt-6" role="alert">
      <AlertDescription>{{ t("notFound") }}</AlertDescription>
    </Alert>
    <Alert v-else-if="isError" variant="destructive" class="mt-6" role="alert">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ t("error") }}
        <Button variant="outline" size="sm" @click="refetch()">{{ t("retry") }}</Button>
      </AlertDescription>
    </Alert>
    <template v-else-if="event">
      <h1 class="mt-4 text-2xl font-semibold">{{ event.title }}</h1>
      <p class="text-muted-foreground mt-1 text-sm">{{ startsAt(event.starts_at) }}</p>
      <p v-if="event.description" class="mt-4 whitespace-pre-line">{{ event.description }}</p>
      <p class="mt-4 font-medium">
        {{ event.free_seats > 0 ? t("freeSeats", event.free_seats) : t("noSeats") }}
      </p>

      <Card class="mt-6">
        <CardHeader>
          <CardTitle as="h2">{{ t("register") }}</CardTitle>
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
    </template>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "back": "Все события",
  "loading": "Загружаем…",
  "error": "Не удалось загрузить событие",
  "retry": "Повторить",
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
