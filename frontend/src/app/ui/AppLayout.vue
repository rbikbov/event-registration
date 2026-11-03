<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import { orgQueryKey } from "@/entities/event";
import { logout, meQuery } from "@/entities/session";
import { routes } from "@/shared/config";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

const { t } = useI18n({ useScope: "local" });
const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();

// The header only shows who is signed in; where a guest may go is the route guard's decision.
// The session changes on sign-in, sign-out and a 401 only, so `me` is not asked again: not on
// mount (on an organizer page the guard has just asked it), not on focus — a `null` from there
// would show "Вход" over an organizer page without the guard ever running.
const me = useQuery({ ...meQuery, refetchOnMount: false, refetchOnWindowFocus: false });
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
// The error is about the click on this screen: it does not follow the organizer to the next one.
watch(
  () => route.path,
  () => signOut.reset(),
);
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
            <Button
              variant="ghost"
              size="sm"
              :disabled="signOut.isPending.value"
              @click="signOut.mutate()"
            >
              {{ t("signOut") }}
            </Button>
          </template>
          <RouterLink v-else class="hover:underline" :to="routes.login">
            {{ t("signIn") }}
          </RouterLink>
        </nav>
      </div>
    </header>
    <div v-if="signOut.isError.value" class="mx-auto w-full max-w-4xl px-4 pt-4">
      <Alert variant="destructive" role="alert">
        <AlertDescription>{{ t("signOutError") }}</AlertDescription>
      </Alert>
    </div>
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
  "signOut": "Выйти",
  "signOutError": "Не удалось выйти, повторите"
}
</i18n>
