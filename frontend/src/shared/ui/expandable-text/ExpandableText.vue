<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { nextTick, onMounted, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import { Button } from "@/shared/ui/shadcn/button";

// A text with its line breaks, cut to four lines; the button shows only when something is cut.
const props = defineProps<{ text: string }>();

const { t } = useI18n({ useScope: "local" });
const id = useId();
const paragraph = useTemplateRef<HTMLElement>("paragraph");
const expanded = ref(false);
const cut = ref(false);

// Only the clamped paragraph tells whether the text is longer than four lines; an expanded one
// keeps the last answer, so the button to collapse it stays.
function measure(): void {
  const element = paragraph.value;
  if (element === null || expanded.value) return;
  cut.value = element.scrollHeight > element.clientHeight;
}

onMounted(measure);
watch(() => props.text, measure, { flush: "post" });
// A narrower screen may cut a text that fit before, a wider one may fit it.
useResizeObserver(paragraph, measure);

async function toggle(): Promise<void> {
  expanded.value = !expanded.value;
  await nextTick();
  measure();
}
</script>

<template>
  <div v-if="text">
    <p
      :id="id"
      ref="paragraph"
      class="whitespace-pre-line wrap-anywhere"
      :class="{ 'line-clamp-4': !expanded }"
    >
      {{ text }}
    </p>
    <Button
      v-if="cut"
      variant="link"
      class="h-auto p-0"
      :aria-expanded="expanded"
      :aria-controls="id"
      @click="toggle"
    >
      {{ expanded ? t("collapse") : t("expand") }}
    </Button>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "expand": "Развернуть",
  "collapse": "Свернуть"
}
</i18n>
