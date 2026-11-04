<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useRouter, type RouteLocationRaw } from "vue-router";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/ui/shadcn/pagination";

// The pages of a list: first, previous, the current one with its neighbours, next, last. A gap
// ("…") stands where numbers are left out. Below `md` the gaps and the words of the buttons are
// hidden: with them the bar is wider than the page from 640 px (`sm`) to about 700 px.
// The page lives in the address: a button goes to `link(page)`, the caller reads it back.
// Nothing on one page, and nothing past the end: the page shows its own way to the last one.
const props = defineProps<{
  page: number;
  pages: number;
  link: (page: number) => RouteLocationRaw;
  label: string;
}>();

const { t } = useI18n({ useScope: "local" });
const router = useRouter();

function go(page: number): void {
  void router.push(props.link(page));
}

// The numbers the bar shows: the current page with its neighbours (no gaps without edges).
function numbers(items: ({ type: "page"; value: number } | { type: "ellipsis" })[]): number[] {
  return items.flatMap((item) => (item.type === "page" ? [item.value] : []));
}
</script>

<template>
  <Pagination
    v-if="pages > 1 && page <= pages"
    :page="page"
    :total="pages"
    :items-per-page="1"
    :sibling-count="1"
    :aria-label="label"
    @update:page="go"
  >
    <PaginationContent v-slot="{ items }">
      <PaginationFirst :aria-label="t('first')">
        <ChevronsLeft />
        <span class="hidden md:block">{{ t("firstShort") }}</span>
      </PaginationFirst>
      <PaginationPrevious :aria-label="t('previous')">
        <ChevronLeft />
        <span class="hidden md:block">{{ t("previousShort") }}</span>
      </PaginationPrevious>
      <PaginationEllipsis
        v-if="(numbers(items)[0] ?? 1) > 1"
        class="hidden md:flex"
        aria-hidden="true"
      >
        <MoreHorizontal class="size-4" />
      </PaginationEllipsis>
      <PaginationItem
        v-for="n in numbers(items)"
        :key="n"
        :value="n"
        :is-active="n === page"
        :aria-label="t('page', { n })"
      >
        {{ n }}
      </PaginationItem>
      <PaginationEllipsis
        v-if="(numbers(items).at(-1) ?? pages) < pages"
        class="hidden md:flex"
        aria-hidden="true"
      >
        <MoreHorizontal class="size-4" />
      </PaginationEllipsis>
      <PaginationNext :aria-label="t('next')">
        <span class="hidden md:block">{{ t("nextShort") }}</span>
        <ChevronRight />
      </PaginationNext>
      <PaginationLast :aria-label="t('last')">
        <span class="hidden md:block">{{ t("lastShort") }}</span>
        <ChevronsRight />
      </PaginationLast>
    </PaginationContent>
  </Pagination>
</template>

<i18n lang="json" locale="ru">
{
  "first": "Первая страница",
  "firstShort": "Первая",
  "previous": "Предыдущая страница",
  "previousShort": "Предыдущая",
  "next": "Следующая страница",
  "nextShort": "Следующая",
  "last": "Последняя страница",
  "lastShort": "Последняя",
  "page": "Страница {n}"
}
</i18n>
