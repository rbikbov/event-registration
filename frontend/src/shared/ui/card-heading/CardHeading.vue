<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/shared/lib/class-names";

// The shadcn CardTitle is always an h3 and drops `as` silently; the level of a heading belongs
// to the page outline, so it is required here.
const props = defineProps<{
  level: 1 | 2 | 3;
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <component
    :is="`h${props.level}`"
    data-slot="card-title"
    :class="cn('leading-none font-semibold', props.class)"
  >
    <slot />
  </component>
</template>
