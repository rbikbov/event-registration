<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  changedFields,
  eventFormInput,
  orgEventsQuery,
  parseEventChanges,
  publicEventsQuery,
  serverFormErrors,
  type EventFormErrors,
  type EventFormInput,
  type OrgEvent,
} from "@/entities/event";
import { AppError } from "@/shared/api";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
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

import { updateEvent } from "../api/update-event";

// A tab of the event layout (pages/org-event): the layout reads the event and keeps it live.
const props = defineProps<{ event: OrgEvent }>();

const { t } = useI18n({ useScope: "local" });
const queryClient = useQueryClient();

// What the form started from: the event as it was opened or last saved here. Not the live event:
// its snapshots come with every registration, and a field another tab changed meanwhile would
// read as changed here and be sent back.
const initial = ref<EventFormInput>(eventFormInput(props.event));
const form = reactive<EventFormInput>({ ...initial.value });
const clientErrors = ref<EventFormErrors>({});
const confirming = ref(false);

const changed = computed(() => changedFields(form, initial.value));
// The number field applies a typed value on blur, and a press on the save button blurs it only
// after meeting the button: disabled until then, the first click would be lost. While a value is
// typed and not applied yet, the button is on; the submit after the blur sees the applied value.
const capacityTyped = ref(false);
const canSave = computed(() => changed.value.length > 0 || capacityTyped.value);

const { mutate, isPending, isSuccess, error, reset } = useMutation({
  mutationFn: (changes: Parameters<typeof updateEvent>[1]) => updateEvent(props.event.id, changes),
  onSuccess: async (updated) => {
    // Not into the event cache: the counts of the answer are read after the commit, and a
    // snapshot of a registration committed meanwhile is newer. The change itself notifies the
    // stream, whose snapshot brings the new fields to the header.
    // The form keeps what was typed: it is what was saved, so nothing reads as changed now.
    initial.value = eventFormInput(updated);
    // Exact: the list key prefixes the panel's, which the stream keeps (see above).
    await queryClient.invalidateQueries({ queryKey: orgEventsQuery.queryKey, exact: true });
    await queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey });
  },
});

// "Saved", a server error and the question about emails describe the values that were sent;
// once the organizer edits again they are stale.
watch(form, () => {
  confirming.value = false;
  if (isPending.value) return;
  reset();
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

// Who gets the email about the new date: the counts are live, as the layout keeps the event.
const recipients = computed(() => props.event.confirmed + props.event.waitlisted);

function submit(): void {
  if (isPending.value || changed.value.length === 0) return;
  const parsed = parseEventChanges(form, initial.value, new Date());
  if (!parsed.ok) {
    clientErrors.value = parsed.errors;
    return;
  }
  clientErrors.value = {};
  if (parsed.changes.starts_at !== undefined && recipients.value > 0 && !confirming.value) {
    confirming.value = true;
    return;
  }
  confirming.value = false;
  mutate(parsed.changes);
}

function errorText(field: keyof EventFormErrors): string | null {
  const code = fieldErrors.value[field];
  if (code === undefined) return null;
  if (code === "below_confirmed") return t("errors.below_confirmed", { n: props.event.confirmed });
  return t(`errors.${code}`);
}

const textFields: { name: "title" | "description" | "starts_at"; type: string }[] = [
  { name: "title", type: "text" },
  { name: "description", type: "textarea" },
  { name: "starts_at", type: "datetime-local" },
];
</script>

<template>
  <form class="grid max-w-xl gap-4" novalidate @submit.prevent="submit">
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
      />
      <Input
        v-else
        :id="field.name"
        v-model="form[field.name]"
        :type="field.type"
        :aria-invalid="fieldErrors[field.name] !== undefined"
      />
      <p v-if="errorText(field.name)" class="text-destructive text-sm">
        {{ errorText(field.name) }}
      </p>
    </div>
    <div class="grid gap-2">
      <Label for="capacity">{{ t("fields.capacity") }}</Label>
      <NumberField id="capacity" v-model="form.capacity">
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput
            :aria-invalid="fieldErrors.capacity !== undefined"
            @input="capacityTyped = true"
            @blur="capacityTyped = false"
          />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>
      <p v-if="errorText('capacity')" class="text-destructive text-sm">
        {{ errorText("capacity") }}
      </p>
    </div>

    <Alert v-if="confirming" data-confirm="reschedule">
      <AlertDescription class="grid gap-3">
        <p>
          {{ t("confirm.text", { confirmed: event.confirmed, waitlisted: event.waitlisted }) }}
        </p>
        <div class="flex gap-2">
          <Button type="button" @click="submit">{{ t("confirm.yes") }}</Button>
          <Button type="button" variant="outline" @click="confirming = false">
            {{ t("confirm.no") }}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
    <div v-else class="flex items-center gap-3">
      <Button type="submit" :disabled="isPending || !canSave">
        {{ isPending ? t("submitting") : t("submit") }}
      </Button>
      <p v-if="isSuccess" class="text-muted-foreground text-sm" role="status">{{ t("saved") }}</p>
    </div>
  </form>
</template>

<i18n lang="json" locale="ru">
{
  "fields": {
    "title": "Название",
    "description": "Описание",
    "starts_at": "Начало",
    "capacity": "Мест"
  },
  "submit": "Сохранить",
  "submitting": "Сохраняем…",
  "saved": "Сохранено",
  "tryLater": "Не удалось сохранить событие, попробуйте позже",
  "confirm": {
    "text": "Участникам (подтверждено {confirmed}, в листе {waitlisted}) уйдёт письмо о переносе.",
    "yes": "Перенести",
    "no": "Отмена"
  },
  "errors": {
    "required": "Обязательное поле",
    "blank": "Обязательное поле",
    "max_length": "Слишком длинное значение",
    "min_value": "Должно быть не меньше 1",
    "max_value": "Должно быть не больше 10 000",
    "invalid": "Некорректное значение",
    "past": "Начало должно быть в будущем",
    "below_confirmed": "Не меньше подтверждённых: {n}"
  }
}
</i18n>
