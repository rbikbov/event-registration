import { createI18n } from "vue-i18n";

// Russian plural forms: "1 место | 2 места | 5 мест". vue-i18n's default rule knows only
// zero/one/other for three forms.
export function russianPlural(count: number): 0 | 1 | 2 {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return 0;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 1;
  return 2;
}

// Messages are not global: each component keeps its own in an <i18n> block next to the
// template (useI18n({ useScope: "local" })). Russian is the only locale the task requires.
export function createAppI18n() {
  return createI18n({
    legacy: false,
    locale: "ru",
    fallbackLocale: "ru",
    pluralRules: { ru: russianPlural },
  });
}
