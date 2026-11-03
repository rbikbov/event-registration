<script setup lang="ts">
// A screen-sized answer in place of the page content: nothing found, no access, nothing loaded.
// The heading level belongs to the page outline: 1 where this is all the page shows.
defineProps<{ title: string; text?: string; level: 1 | 2 }>();
defineSlots<{ actions?(): unknown }>();
</script>

<template>
  <section class="py-10 text-center" role="alert">
    <component
      :is="`h${level}`"
      class="font-semibold wrap-anywhere"
      :class="level === 1 ? 'text-2xl' : 'text-lg'"
    >
      {{ title }}
    </component>
    <p v-if="text" class="text-muted-foreground mt-2">{{ text }}</p>
    <div v-if="$slots.actions" class="mt-6 flex flex-wrap justify-center gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>
