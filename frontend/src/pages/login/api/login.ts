import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export function login(credentials: components["schemas"]["LoginRequest"]) {
  return unwrap(api.POST("/api/auth/login/", { body: credentials }));
}
