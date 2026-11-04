<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
  EVENT_TEXT_MAX,
  orgEventListsKey,
  parseEventForm,
  publicEventListsKey,
  serverFormErrors,
  type EventFormErrors,
  type EventFormInput,
} from "@/entities/event";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { CharCounter } from "@/shared/ui/char-counter";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/shared/ui/shadcn/number-field";
import { Textarea } from "@/shared/ui/shadcn/textarea";

import { createEvent } from "../api/create-event";

const { t } = useI18n({ useScope: "local" });
const router = useRouter();
const queryClient = useQueryClient();

const form = reactive<EventFormInput>({
  title: "",
  description: "",
  starts_at: "",
  capacity: undefined,
});
const clientErrors = ref<EventFormErrors>({});

const { mutate, isPending, error, reset } = useMutation({
  mutationFn: createEvent,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: orgEventListsKey });
    await queryClient.invalidateQueries({ queryKey: publicEventListsKey });
    await router.push(routes.orgEvents);
  },
});

// A server error describes the values that were sent; once they change it is stale.
watch(form, () => {
  if (error.value !== null) reset();
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

const textFields: { name: "title" | "description" | "starts_at"; type: string; max?: number }[] = [
  { name: "title", type: "text", max: EVENT_TEXT_MAX.title },
  { name: "description", type: "textarea", max: EVENT_TEXT_MAX.description },
  { name: "starts_at", type: "datetime-local" },
];
</script>

<template>
  <div class="mx-auto max-w-xl">
    <Card>
      <CardHeader>
        <CardHeading :level="1" class="text-2xl leading-tight">{{ t("title") }}</CardHeading>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" novalidate @submit.prevent="submit">
          <Alert v-if="submitError" variant="destructive" role="alert">
            <AlertDescription>{{ submitError }}</AlertDescription>
          </Alert>
          <div v-for="field in textFields" :key="field.name" class="grid gap-2">
            <Label :for="field.name">{{ t(`fields.${field.name}`) }}</Label>
            <Textarea
              v-if="field.type === 'textarea'"
              :id="field.name"
              v-model="form[field.name]"
              :aria-invalid="fieldErrors[field.name] !== undefined"
              :aria-describedby="field.max ? `${field.name}-count` : undefined"
            />
            <Input
              v-else
              :id="field.name"
              v-model="form[field.name]"
              :type="field.type"
              :aria-invalid="fieldErrors[field.name] !== undefined"
              :aria-describedby="field.max ? `${field.name}-count` : undefined"
            />
            <div
              v-if="fieldErrors[field.name] || field.max"
              class="flex items-start justify-between gap-2"
            >
              <p v-if="fieldErrors[field.name]" class="text-destructive text-sm">
                {{ t(`errors.${fieldErrors[field.name]}`) }}
              </p>
              <CharCounter
                v-if="field.max"
                :id="`${field.name}-count`"
                :value="form[field.name]"
                :max="field.max"
                class="ms-auto"
              />
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="capacity">{{ t("fields.capacity") }}</Label>
            <NumberField id="capacity" v-model="form.capacity">
              <NumberFieldContent>
                <NumberFieldDecrement />
                <NumberFieldInput :aria-invalid="fieldErrors.capacity !== undefined" />
                <NumberFieldIncrement />
              </NumberFieldContent>
            </NumberField>
            <p v-if="fieldErrors.capacity" class="text-destructive text-sm">
              {{ t(`errors.${fieldErrors.capacity}`) }}
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
  </div>
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
