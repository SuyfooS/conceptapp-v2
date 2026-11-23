import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };

/**
 * The app's Hebrew sentences as the screens format them, for sentences with
 * arguments of a kind (`{form, select, …}`) that `.replace("{name}", …)`
 * can't fill. A missing argument doesn't throw: next-intl logs and returns the
 * key, so a spec that forgets one fails on the text it looks for.
 */
export const heT = createTranslator({ locale: "he", messages: he });

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What a tab adds to its name while something on it needs the person, for
 * one thing or for more (`ui.appShell.needsAction`, a plural): its words
 * after the comma, at any count.
 */
export const NEEDS_ACTION = new RegExp(
  [1, 2]
    .map((count) =>
      literal(
        heT("ui.appShell.needsAction", { count }).replace(/^,\s*/, ""),
      ).replace(String(count), "\\d+"),
    )
    .join("|"),
);
