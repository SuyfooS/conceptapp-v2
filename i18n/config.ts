// Locales the app ships in. Hebrew is the default and the only one served
// until a business or user can choose; English exists so every string has a
// second home and nothing assumes RTL. The /design gallery shows both.
export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "he";

export function direction(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}
