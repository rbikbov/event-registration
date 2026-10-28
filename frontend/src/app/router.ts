import { createRouter, createWebHistory } from "vue-router";

import { HealthPage } from "@/pages/health";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: HealthPage }],
});
