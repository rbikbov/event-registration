<script lang="ts">
import type { Ref } from "vue";

// What a useQuery result gives; declared here so shared/ui does not depend on the query library.
export interface QueryStateSource<T> {
  data: Readonly<Ref<T | undefined>>;
  isPending: Readonly<Ref<boolean>>;
  isError: Readonly<Ref<boolean>>;
  isFetching: Readonly<Ref<boolean>>;
  refetch: () => Promise<unknown>;
}
</script>

<script setup lang="ts" generic="T">
import { useI18n } from "vue-i18n";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

// A failed refetch (window focus, invalidation) keeps the data in TanStack Query and sets
// isError: the error goes above the data, which stays on screen, instead of replacing it.
const props = defineProps<{
  query: QueryStateSource<T>;
  /** The first load failed: nothing to show. */
  errorText: string;
  /** A refetch failed: the data on screen is the previous one. */
  refreshErrorText: string;
}>();

defineSlots<{ default(props: { data: T }): unknown }>();

const { t } = useI18n({ useScope: "local" });

// A retry of the first load shows the loading state (the query goes back to pending); a retry
// after a failed refetch keeps the error and the data, so the button itself shows the request.
function retry(): void {
  if (props.query.isFetching.value) return;
  void props.query.refetch();
}
</script>

<template>
  <div>
    <p v-if="query.isPending.value" class="text-muted-foreground" role="status">
      {{ t("loading") }}
    </p>
    <template v-else-if="query.data.value !== undefined">
      <Alert v-if="query.isError.value" variant="destructive" class="mb-4" role="alert">
        <AlertDescription class="flex items-center justify-between gap-4">
          {{ refreshErrorText }}
          <Button variant="outline" size="sm" :disabled="query.isFetching.value" @click="retry">
            {{ query.isFetching.value ? t("loading") : t("retry") }}
          </Button>
        </AlertDescription>
      </Alert>
      <slot :data="query.data.value" />
    </template>
    <Alert v-else-if="query.isError.value" variant="destructive" role="alert">
      <AlertDescription class="flex items-center justify-between gap-4">
        {{ errorText }}
        <Button variant="outline" size="sm" @click="retry">{{ t("retry") }}</Button>
      </AlertDescription>
    </Alert>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "loading": "Загружаем…",
  "retry": "Повторить"
}
</i18n>
