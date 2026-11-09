import { placeholdersOf } from "@domain/wording";
import { createTranslator } from "next-intl";

/**
 * Whether a sentence formats as the app will format it: the ICU syntax
 * (braces, plural branches) and its tags, with a stand-in for each argument.
 * @domain/wording checks what the sentence keeps; this checks it reads.
 */
export function formatsCleanly(sentence: string): boolean {
  let broken = false;
  const t = createTranslator({
    locale: "he",
    messages: { probe: sentence },
    onError: () => {
      broken = true;
    },
  });
  const { args, tags } = placeholdersOf(sentence);
  const values: Record<string, unknown> = {};
  for (const arg of args) {
    const [name = "", kind] = arg.slice(1, -1).split(",");
    values[name] =
      kind === "plural" || kind === "selectordinal" || kind === "number"
        ? 2
        : "x";
  }
  for (const tag of tags) {
    if (!tag.startsWith("</")) {
      values[tag.slice(1, -1)] = (chunks: string) => chunks;
    }
  }
  try {
    t.markup("probe", values as never);
  } catch {
    broken = true;
  }
  return !broken;
}
