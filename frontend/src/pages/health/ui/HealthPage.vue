<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

import { healthQuery } from "../api/health";

const { data, isPending, isError } = useQuery(healthQuery);
</script>

<template>
  <main>
    <h1>Состояние сервиса</h1>
    <p v-if="isPending">Проверяем backend…</p>
    <p v-else-if="isError" role="alert">Backend недоступен</p>
    <p v-else-if="data">Backend: {{ data.status }}, база данных: {{ data.database }}</p>
  </main>
</template>
