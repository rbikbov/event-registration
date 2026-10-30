<script setup lang="ts">
import { routes } from "@/shared/config";
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="text-2xl font-semibold">Регистрация на мероприятия</h1>
    <ul class="mt-4 grid gap-2">
      <li><RouterLink class="underline" :to="routes.login">Вход для организатора</RouterLink></li>
      <li>
        <RouterLink class="underline" :to="routes.orgEvents">События организатора</RouterLink>
      </li>
      <li><RouterLink class="underline" :to="routes.health">Состояние сервиса</RouterLink></li>
    </ul>
  </main>
</template>
