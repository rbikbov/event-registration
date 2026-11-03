<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import { orgQueryKey } from "@/entities/event";
import { logout, meQuery } from "@/entities/session";
import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/shadcn/button";

const { t } = useI18n({ useScope: "local" });
const router = useRouter();
const queryClient = useQueryClient();

// The header only shows who is signed in; where a guest may go is the route guard's decision.
// On an organizer page the guard has just asked `me`: no second request on mount.
const me = useQuery({ ...meQuery, refetchOnMount: false });
const user = computed(() => me.data.value ?? null);

const signOut = useMutation({
  mutationFn: logout,
  onSuccess: async () => {
    queryClient.setQueryData(meQuery.queryKey, null);
    // Leave the organizer page first: dropped while it is open, its queries would be asked again.
    await router.push(routes.home);
    queryClient.removeQueries({ queryKey: orgQueryKey });
  },
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b">
      <div class="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <RouterLink class="font-semibold" :to="routes.home">{{ t("events") }}</RouterLink>
        <nav v-if="!me.isPending.value" class="flex items-center gap-3 text-sm">
          <template v-if="user">
            <RouterLink class="hover:underline" :to="routes.orgEvents">
              {{ t("myEvents") }}
            </RouterLink>
            <span class="text-muted-foreground hidden sm:inline">{{ user.email }}</span>
            <Button variant="ghost" size="sm" @click="signOut.mutate()">
              {{ t("signOut") }}
            </Button>
          </template>
          <RouterLink v-else class="hover:underline" :to="routes.login">
            {{ t("signIn") }}
          </RouterLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
      <slot />
    </main>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "events": "События",
  "myEvents": "Мои события",
  "signIn": "Вход для организатора",
  "signOut": "Выйти"
}
</i18n>
