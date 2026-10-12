import type messages from "../messages/he.json";
import type { Locale } from "./config";

// Typed keys: useTranslations/getTranslations reject a key that is not in
// messages/he.json. tooling/messages.test.ts keeps en.json in step.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
