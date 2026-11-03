<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/shadcn/button";

import ErrorState from "./ErrorState.vue";

// The URL stays as typed: the user sees what was not found and can correct it.
defineProps<{ title: string }>();

const { t } = useI18n({ useScope: "local" });
</script>

<template>
  <ErrorState :title="title" :level="1">
    <template #actions>
      <Button variant="outline" as-child>
        <RouterLink :to="routes.home">{{ t("toEvents") }}</RouterLink>
      </Button>
    </template>
  </ErrorState>
</template>

<i18n lang="json" locale="ru">
{
  "toEvents": "К событиям"
}
</i18n>
