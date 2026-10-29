import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";
import { createWebHistory } from "vue-router";

import App from "./App.vue";
import { queryClient } from "./query-client";
import { createAppRouter } from "./router";
import "./styles.css";

export function mountApp(selector: string): void {
  const router = createAppRouter(queryClient, createWebHistory());
  createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount(selector);
}
