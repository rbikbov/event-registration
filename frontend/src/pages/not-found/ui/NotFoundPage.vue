<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { NotFound } from "@/shared/ui/error-state";

const { t } = useI18n({ useScope: "local" });
</script>

<template>
  <NotFound :title="t('title')" />
</template>

<i18n lang="json" locale="ru">
{
  "title": "Страница не найдена"
}
</i18n>
