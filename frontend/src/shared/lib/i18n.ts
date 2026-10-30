import { createI18n } from "vue-i18n";

// Messages are not global: each component keeps its own in an <i18n> block next to the
// template (useI18n({ useScope: "local" })). Russian is the only locale the task requires.
export function createAppI18n() {
  return createI18n({ legacy: false, locale: "ru", fallbackLocale: "ru" });
}
