<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import {
  publicEventLive,
  publicEventProbe,
  publicEventQuery,
  publicEventListsKey,
} from "@/entities/event";
import { AppError } from "@/shared/api";
import { useLive } from "@/shared/lib/use-live";
import { NotFound } from "@/shared/ui/error-state";
import { ExpandableText } from "@/shared/ui/expandable-text";
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

const isNotFound = (error: unknown) => error instanceof AppError && error.kind === "not_found";
// A probe after a refused stream found the event gone since the GET.
const goneSinceLoad = ref(false);
watch(eventId, () => (goneSinceLoad.value = false));
const notFound = computed(() => isNotFound(event.error.value) || goneSinceLoad.value);

// The stream opens once the event is there, so its first snapshot is read after that GET.
// Before it, 404 comes from the GET; EventSource does not tell it.
const eventLoaded = computed(() => event.data.value !== undefined);
useLive(
  () => (eventLoaded.value && !notFound.value ? publicEventLive(eventId.value) : null),
  (snapshot) => queryClient.setQueryData(publicEventQuery(eventId.value).queryKey, snapshot),
  { onRefused: () => void probe(eventId.value) },
);

// EventSource does not tell why it was refused, so the event is read again for its status: 404
// ends the stream and shows as the GET's would; anything else (the backend is down) leaves the
// stream to be opened again.
async function probe(id: number) {
  try {
    await queryClient.fetchQuery(publicEventProbe(id));
  } catch (error) {
    if (id === eventId.value) goneSinceLoad.value = isNotFound(error);
  }
}

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
  // with the snapshot of the registration; the list key leaves the event's own key alone.
  onSuccess: () => queryClient.invalidateQueries({ queryKey: publicEventListsKey }),
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

function submit(): void {
  const parsed = parseRegistrationForm(form);
  if (!parsed.ok) {
    clientErrors.value = parsed.errors;
    return;
  }
  clientErrors.value = {};
  mutate(parsed.values);
}

const fields: { name: "email" | "name"; type: string; autocomplete: string }[] = [
  { name: "email", type: "email", autocomplete: "email" },
  { name: "name", type: "text", autocomplete: "name" },
];
</script>

<template>
  <div class="mx-auto max-w-xl">
    <NotFound v-if="notFound" :title="t('notFound')" />
    <QueryState
      v-else
      v-slot="{ data: loaded }"
      :level="1"
      :query="event"
      :error-text="t('error')"
      :refresh-error-text="t('refreshError')"
    >
      <h1 class="text-2xl font-semibold wrap-anywhere">{{ loaded.title }}</h1>
      <p class="text-muted-foreground mt-1 text-sm">{{ d(new Date(loaded.starts_at), "long") }}</p>
      <ExpandableText class="mt-4" :text="loaded.description" />
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
  </div>
</template>

<i18n lang="json" locale="ru">
{
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
