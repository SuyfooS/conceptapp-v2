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
 * What a tab says after its comma while `count` things on it need the
 * person (`ui.appShell.needsAction`, a plural): "אחד דורש טיפול" for one,
 * with no digit, "2 דורשים טיפול" for more.
 */
const needsActionWords = (count: number) =>
  heT("ui.appShell.needsAction", { count }).replace(/^,\s*/, "");

/**
 * What a tab adds to its name while something on it needs the person, for
 * one thing or for more: its words after the comma, at any count.
 */
export const NEEDS_ACTION = new RegExp(
  [1, 2]
    .map((count) =>
      literal(needsActionWords(count)).replace(String(count), "\\d+"),
    )
    .join("|"),
);

/**
 * A tab's name while it says `count` things need the person, in the
 * plural's form for that count: "צ׳אט, אחד דורש טיפול", "צ׳אט, 2 דורשים
 * טיפול".
 */
export function countedTabName(label: string, count: number): RegExp {
  return new RegExp(
    `^${literal(label)}\\s*,\\s*${literal(needsActionWords(count))}`,
  );
}

/**
 * How many things a tab's name or text says need the person (0 when it says
 * none), read from its words in either form of the plural. The badge's
 * digit, hidden from a screen reader, comes before the comma and is never
 * what is read.
 */
export function needsActionCount(text: string): number {
  for (const count of [1, 2]) {
    const words = literal(needsActionWords(count)).replace(
      String(count),
      "(\\d+)",
    );
    const said = new RegExp(`,\\s*${words}`).exec(text);
    if (said) return said[1] === undefined ? count : Number(said[1]);
  }
  return 0;
}
