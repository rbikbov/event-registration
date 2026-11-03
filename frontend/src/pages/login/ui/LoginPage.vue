<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import { forgetUserData, meQuery } from "@/entities/session";
import { routes } from "@/shared/config";
import { safeNext } from "@/shared/lib/safe-next";
import { AppError } from "@/shared/api";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { CardHeading } from "@/shared/ui/card-heading";
import { Card, CardContent, CardHeader } from "@/shared/ui/shadcn/card";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { login } from "../api/login";
import { parseLoginForm, type LoginField, type LoginFieldError } from "../model/login-form";

const { t } = useI18n({ useScope: "local" });
const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();

const form = reactive({ email: "", password: "" });
const fieldErrors = ref<Partial<Record<LoginField, LoginFieldError>>>({});

const { mutate, isPending, error } = useMutation({
  mutationFn: login,
  onSuccess: async (user) => {
    forgetUserData(queryClient);
    queryClient.setQueryData(meQuery.queryKey, user);
    await router.push(safeNext(route.query.next) ?? routes.orgEvents);
  },
});

const submitError = computed(() => {
  if (!(error.value instanceof AppError)) return null;
  return error.value.kind === "validation" ? t("wrongCredentials") : t("tryLater");
});

function submit(): void {
  const parsed = parseLoginForm(form);
  if (!parsed.ok) {
    fieldErrors.value = parsed.errors;
    return;
  }
  fieldErrors.value = {};
  mutate(parsed.values);
}
</script>

<template>
  <div class="mx-auto max-w-sm sm:mt-8">
    <Card class="w-full">
      <CardHeader>
        <CardHeading :level="1">{{ t("title") }}</CardHeading>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" novalidate @submit.prevent="submit">
          <Alert v-if="submitError" variant="destructive" role="alert">
            <AlertDescription>{{ submitError }}</AlertDescription>
          </Alert>
          <div class="grid gap-2">
            <Label for="email">{{ t("email") }}</Label>
            <Input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="username"
              :aria-invalid="fieldErrors.email !== undefined"
            />
            <p v-if="fieldErrors.email" class="text-destructive text-sm">
              {{ t(`errors.${fieldErrors.email}`) }}
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="password">{{ t("password") }}</Label>
            <Input
              id="password"
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              :aria-invalid="fieldErrors.password !== undefined"
            />
            <p v-if="fieldErrors.password" class="text-destructive text-sm">
              {{ t(`errors.${fieldErrors.password}`) }}
            </p>
          </div>
          <Button type="submit" :disabled="isPending">
            {{ isPending ? t("submitting") : t("submit") }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<i18n lang="json" locale="ru">
{
  "title": "Вход для организатора",
  "email": "Email",
  "password": "Пароль",
  "submit": "Войти",
  "submitting": "Входим…",
  "wrongCredentials": "Неверный email или пароль",
  "tryLater": "Не удалось войти, попробуйте позже",
  "errors": {
    "required": "Обязательное поле",
    "invalid_email": "Введите email в формате name{'@'}example.com"
  }
}
</i18n>
