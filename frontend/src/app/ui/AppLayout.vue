<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useOnline } from "@vueuse/core";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import { forgetUserData, logout, meQuery } from "@/entities/session";
import { routes } from "@/shared/config";
import { NavLink } from "@/shared/ui/nav-link";
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
    // Leave the organizer page first: only what no screen shows is dropped.
    await router.push(routes.home);
    forgetUserData(queryClient);
  },
});
// One notice for the whole app instead of a line in every failed request. By `navigator.onLine`
// and its events, which are sure only of "offline": online means a network, not a working backend.
const online = useOnline();

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
        <nav v-if="!me.isPending.value" class="flex items-center gap-1 text-sm">
          <template v-if="user">
            <NavLink :to="routes.orgEvents">{{ t("myEvents") }}</NavLink>
            <span class="text-muted-foreground hidden px-2 sm:inline">{{ user.email }}</span>
            <Button
              variant="ghost"
              size="sm"
              :disabled="signOut.isPending.value"
              @click="signOut.mutate()"
            >
              {{ t("signOut") }}
            </Button>
          </template>
          <NavLink v-else :to="routes.login">{{ t("signIn") }}</NavLink>
        </nav>
      </div>
    </header>
    <div v-if="!online" class="mx-auto w-full max-w-4xl px-4 pt-4">
      <Alert role="status" data-offline>
        <AlertDescription>{{ t("offline") }}</AlertDescription>
      </Alert>
    </div>
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
  "signOutError": "Не удалось выйти, повторите",
  "offline": "Нет подключения к интернету"
}
</i18n>
