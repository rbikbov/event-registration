<script setup lang="ts">
import { computed } from "vue";

// "12/200" under a text field with a limit. Counted without the spaces around the text, as the
// form schema and the server check it. Over the limit it only turns red: the error comes on
// submit, as for any field. No `maxlength` on the field instead: it would cut a paste silently.
const props = defineProps<{ value: string; max: number }>();

const length = computed(() => props.value.trim().length);
</script>

<template>
  <p
    class="text-sm tabular-nums"
    :class="length > max ? 'text-destructive' : 'text-muted-foreground'"
  >
    {{ length }}/{{ max }}
  </p>
</template>
