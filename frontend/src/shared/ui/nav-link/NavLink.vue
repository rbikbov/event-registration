<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

import { Button } from "@/shared/ui/shadcn/button";

// A link of the header or of the tabs: the page it leads to, when open, stands out. By the exact
// match: the first tab of the organizer's event shares the layout's path, so the router counts it
// active on every other tab too.
defineProps<{ to: RouteLocationRaw }>();
</script>

<template>
  <RouterLink v-slot="{ href, navigate, isExactActive }" :to="to" custom>
    <Button :variant="isExactActive ? 'default' : 'ghost'" size="sm" as-child>
      <a :href="href" :aria-current="isExactActive ? 'page' : undefined" @click="navigate">
        <slot />
      </a>
    </Button>
  </RouterLink>
</template>
