import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";
import { createWebHistory } from "vue-router";

import { createAppI18n } from "@/shared/lib/i18n";

import App from "./App.vue";
import { queryClient } from "./query-client";
import { createAppRouter } from "./router";
import { redirectOnExpiredSession } from "./session-expiry";
import "./styles.css";

export function mountApp(selector: string): void {
  const router = createAppRouter(queryClient, createWebHistory());
  redirectOnExpiredSession(queryClient, router);
  createApp(App)
    .use(router)
    .use(createAppI18n())
    .use(VueQueryPlugin, { queryClient })
    .mount(selector);
}
