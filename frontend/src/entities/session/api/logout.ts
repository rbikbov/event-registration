import { api, unwrapEmpty } from "@/shared/api";

export function logout(): Promise<void> {
  return unwrapEmpty(api.POST("/api/auth/logout/"));
}
