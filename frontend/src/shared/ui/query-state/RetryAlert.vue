<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

// A failed request with a retry. While the retry runs the button is blocked and says so: a
// retry with data on screen changes nothing else on the page until the answer comes.
defineProps<{ text: string; fetching: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n({ useScope: "local" });
</script>

<template>
  <Alert variant="destructive" role="alert">
    <AlertDescription class="flex items-center justify-between gap-4">
      {{ text }}
      <Button variant="outline" size="sm" :disabled="fetching" @click="emit('retry')">
        {{ fetching ? t("loading") : t("retry") }}
      </Button>
    </AlertDescription>
  </Alert>
</template>

<i18n lang="json" locale="ru">
{
  "loading": "Загружаем…",
  "retry": "Повторить"
}
</i18n>
