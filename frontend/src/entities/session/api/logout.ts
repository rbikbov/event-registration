import { AppError, api, unwrapEmpty } from "@/shared/api";

// 401: the session has already ended (expired, or signed out in another tab) — the outcome the
// caller asked for. Answered here, it never reaches the 401 handling of the app as a failure.
export async function logout(): Promise<void> {
  try {
    await unwrapEmpty(api.POST("/api/auth/logout/"));
  } catch (error) {
    if (error instanceof AppError && error.kind === "unauthorized") return;
    throw error;
  }
}
