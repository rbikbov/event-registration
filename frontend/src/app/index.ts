import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";

import App from "./App.vue";
import { queryClient } from "./query-client";
import { router } from "./router";
import "./styles.css";

export function mountApp(selector: string): void {
  createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount(selector);
}
