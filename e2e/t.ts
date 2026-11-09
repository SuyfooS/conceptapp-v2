import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };

/**
 * The app's Hebrew sentences as the screens format them, for sentences with
 * arguments of a kind (`{form, select, …}`) that `.replace("{name}", …)`
 * can't fill. A missing argument doesn't throw: next-intl logs and returns the
 * key, so a spec that forgets one fails on the text it looks for.
 */
export const heT = createTranslator({ locale: "he", messages: he });
