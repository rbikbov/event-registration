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

import RetryAlert from "./RetryAlert.vue";

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
// after a failed refetch keeps the error and the data, so RetryAlert shows the request.
function retry(): void {
  void props.query.refetch();
}
</script>

<template>
  <div>
    <p v-if="query.isPending.value" class="text-muted-foreground" role="status">
      {{ t("loading") }}
    </p>
    <template v-else-if="query.data.value !== undefined">
      <RetryAlert
        v-if="query.isError.value"
        class="mb-4"
        :text="refreshErrorText"
        :fetching="query.isFetching.value"
        @retry="retry"
      />
      <slot :data="query.data.value" />
    </template>
    <RetryAlert
      v-else-if="query.isError.value"
      :text="errorText"
      :fetching="query.isFetching.value"
      @retry="retry"
    />
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "loading": "Загружаем…"
}
</i18n>
