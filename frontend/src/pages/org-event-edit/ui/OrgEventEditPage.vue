<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { orgEventQuery, orgEventsQuery, publicEventsQuery, type OrgEvent } from "@/entities/event";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { updateEvent } from "../api/update-event";
import { localInputValue } from "../model/local-input";

// A tab of the event layout (pages/org-event): the layout reads the event and keeps it live.
const props = defineProps<{ event: OrgEvent }>();

const { t } = useI18n({ useScope: "local" });
const queryClient = useQueryClient();

const startsAt = ref(localInputValue(props.event.starts_at));

const { mutate, isPending, isSuccess, isError, reset } = useMutation({
  mutationFn: (value: string) =>
    updateEvent(props.event.id, { starts_at: new Date(value).toISOString() }),
  onSuccess: async (updated) => {
    // The panel shows the answer at once; the stream brings later changes.
    queryClient.setQueryData(orgEventQuery(updated.id).queryKey, updated);
    // Exact: the list key prefixes the panel's, whose data is the answer already.
    await queryClient.invalidateQueries({ queryKey: orgEventsQuery.queryKey, exact: true });
    await queryClient.invalidateQueries({ queryKey: publicEventsQuery.queryKey });
  },
});

// "Saved" and an error describe the value that was sent; once it changes they are stale.
watch(startsAt, () => reset());

function submit(): void {
  mutate(startsAt.value);
}
</script>

<template>
  <form class="grid max-w-xl gap-4" novalidate @submit.prevent="submit">
    <Alert v-if="isError" variant="destructive" role="alert">
      <AlertDescription>{{ t("tryLater") }}</AlertDescription>
    </Alert>
    <div class="grid gap-2">
      <Label for="starts_at">{{ t("fields.starts_at") }}</Label>
      <Input id="starts_at" v-model="startsAt" type="datetime-local" />
    </div>
    <div class="flex items-center gap-3">
      <Button type="submit" :disabled="isPending">
        {{ isPending ? t("submitting") : t("submit") }}
      </Button>
      <p v-if="isSuccess" class="text-muted-foreground text-sm" role="status">{{ t("saved") }}</p>
    </div>
  </form>
</template>

<i18n lang="json" locale="ru">
{
  "fields": {
    "starts_at": "Начало"
  },
  "submit": "Сохранить",
  "submitting": "Сохраняем…",
  "saved": "Сохранено",
  "tryLater": "Не удалось сохранить событие, попробуйте позже"
}
</i18n>
