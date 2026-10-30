<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "local" });
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="text-2xl font-semibold">{{ t("title") }}</h1>
  </main>
</template>

<i18n lang="json" locale="ru">
{
  "title": "События"
}
</i18n>
