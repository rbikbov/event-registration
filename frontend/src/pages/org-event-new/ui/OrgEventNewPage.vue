<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import { orgEventsQuery } from "@/entities/event";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/shadcn/card";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { createEvent } from "../api/create-event";
import {
  parseEventForm,
  serverFormErrors,
  type EventField,
  type EventFormErrors,
} from "../model/event-form";

const { t } = useI18n({ useScope: "local" });
const router = useRouter();
const queryClient = useQueryClient();

const form = reactive({ title: "", description: "", starts_at: "", capacity: "" });
const clientErrors = ref<EventFormErrors>({});

const { mutate, isPending, error } = useMutation({
  mutationFn: createEvent,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: orgEventsQuery.queryKey });
    await router.push(routes.orgEvents);
  },
});

const fieldErrors = computed<EventFormErrors>(() => ({
  ...(error.value instanceof AppError ? serverFormErrors(error.value.fields) : {}),
  ...clientErrors.value,
}));

// A 400 without field codes, or any other failure, has no field to blame.
const submitError = computed(() => {
  if (!(error.value instanceof AppError)) return null;
  if (error.value.kind === "validation" && Object.keys(fieldErrors.value).length > 0) return null;
  return t("tryLater");
});

function submit(): void {
  const parsed = parseEventForm(form, new Date());
  if (!parsed.ok) {
    clientErrors.value = parsed.errors;
    return;
  }
  clientErrors.value = {};
  mutate(parsed.values);
}

// Capacity is a text field with a numeric keyboard: v-model on type="number" would hand the
// form a number, and parseEventForm validates what the user typed.
const fields: { name: EventField; type: string; inputmode?: "numeric" }[] = [
  { name: "title", type: "text" },
  { name: "description", type: "text" },
  { name: "starts_at", type: "datetime-local" },
  { name: "capacity", type: "text", inputmode: "numeric" },
];
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-8">
    <Card>
      <CardHeader>
        <CardTitle as="h1">{{ t("title") }}</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" novalidate @submit.prevent="submit">
          <Alert v-if="submitError" variant="destructive" role="alert">
            <AlertDescription>{{ submitError }}</AlertDescription>
          </Alert>
          <div v-for="field in fields" :key="field.name" class="grid gap-2">
            <Label :for="field.name">{{ t(`fields.${field.name}`) }}</Label>
            <Input
              :id="field.name"
              v-model="form[field.name]"
              :type="field.type"
              :inputmode="field.inputmode"
              :aria-invalid="fieldErrors[field.name] !== undefined"
            />
            <p v-if="fieldErrors[field.name]" class="text-destructive text-sm">
              {{ t(`errors.${fieldErrors[field.name]}`) }}
            </p>
          </div>
          <div class="flex gap-2">
            <Button type="submit" :disabled="isPending">
              {{ isPending ? t("submitting") : t("submit") }}
            </Button>
            <Button as-child variant="outline">
              <RouterLink :to="routes.orgEvents">{{ t("cancel") }}</RouterLink>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Новое событие",
  "fields": {
    "title": "Название",
    "description": "Описание",
    "starts_at": "Начало",
    "capacity": "Мест"
  },
  "submit": "Создать",
  "submitting": "Создаём…",
  "cancel": "Отмена",
  "tryLater": "Не удалось создать событие, попробуйте позже",
  "errors": {
    "required": "Обязательное поле",
    "blank": "Обязательное поле",
    "max_length": "Слишком длинное значение",
    "min_value": "Должно быть не меньше 1",
    "max_value": "Должно быть не больше 10 000",
    "invalid": "Некорректное значение",
    "past": "Начало должно быть в будущем"
  }
}
</i18n>
