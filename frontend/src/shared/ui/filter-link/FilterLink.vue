<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

import { Button } from "@/shared/ui/shadcn/button";

// A filter of a list kept in the address, such as a status or a period: the chosen one stands
// out. The page says which is chosen: not NavLink, whose match by the router ignores the query,
// where a filter lives.
defineProps<{ to: RouteLocationRaw; current: boolean }>();
</script>

<template>
  <Button :variant="current ? 'default' : 'outline'" size="sm" as-child>
    <RouterLink :to="to" :aria-current="current ? 'true' : undefined">
      <slot />
    </RouterLink>
  </Button>
</template>
