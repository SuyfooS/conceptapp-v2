/**
 * Wording (Orel, 7 November 2026): a template or a business replaces a whole
 * sentence of the app's copy, without code. Whole sentences, because swapping
 * one word breaks Hebrew gender. A business's sentence wins over its
 * template's, which wins over the app's own (messages/he.json). Everything
 * here is pure: the app passes its message tree in.
 */

/** A message tree, the shape of messages/he.json. */
export type MessageTree = { readonly [key: string]: string | MessageTree };

/** Sentences that replace the app's, by dotted message key. */
export type Wording = Readonly<Record<string, string>>;

/** The longest replacement sentence, as the database allows. */
export const WORDING_MAX = 400;

/** Only the copy a business sees: its app and its modules. */
const EDITABLE = /^(app|modules)(\.[A-Za-z0-9_]+)+$/;

/**
 * Copy that shows before a business is known or outside it (loading, no
 * business, not found) and page titles, which are drawn before anyone is
 * read. Never replaced.
 */
const NOT_EDITABLE = [
  /^app\.loading$/,
  /^app\.noBusiness\./,
  /^app\.notFound\./,
  /\.metaTitle$/,
];

export function isEditableKey(key: string): boolean {
  return EDITABLE.test(key) && !NOT_EDITABLE.some((rule) => rule.test(key));
}

/** Every sentence of the tree, as [dotted key, sentence]. */
export function messageLeaves(
  tree: MessageTree,
  prefix = "",
): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : messageLeaves(value, `${prefix}${key}.`),
  );
}

/** The keys a template or a business may replace, in the tree's order. */
export function editableKeys(tree: MessageTree): string[] {
  return messageLeaves(tree)
    .map(([key]) => key)
    .filter(isEditableKey);
}

/** The app's sentence at a key, or null when there is none. */
export function baseSentence(tree: MessageTree, key: string): string | null {
  let node: string | MessageTree | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/**
 * What a sentence needs from the code: its ICU arguments, each with its kind
 * ({count} or {count,plural}), and its rich-text tags, opening and closing,
 * as many times as they appear (dropping a closing tag breaks the sentence).
 */
export function placeholdersOf(message: string): {
  args: string[];
  tags: string[];
} {
  const args = [...message.matchAll(/\{\s*(\w+)\s*(?:,\s*(\w+)\s*)?[,}]/g)].map(
    (m) => (m[2] ? `{${m[1]},${m[2]}}` : `{${m[1]}}`),
  );
  const tags = [...message.matchAll(/<(\/?)(\w+)>/g)].map(
    (m) => `<${m[1]}${m[2]}>`,
  );
  return { args: [...new Set(args)].sort(), tags: tags.sort() };
}

/** Whether a replacement keeps every argument and tag of the app's sentence. */
export function sentenceFits(base: string, candidate: string): boolean {
  const a = placeholdersOf(base);
  const b = placeholdersOf(candidate);
  return (
    a.args.join("|") === b.args.join("|") &&
    a.tags.join("|") === b.tags.join("|")
  );
}

/** A business's sentences over its template's. */
export function layerWording(template: Wording, business: Wording): Wording {
  return { ...template, ...business };
}

/**
 * Only what can show: replacements for sentences the app still has, that a
 * business may replace, and that still fit them. A sentence whose app
 * sentence changed its arguments since falls back to the app's.
 */
export function fittingWording(tree: MessageTree, wording: Wording): Wording {
  return Object.fromEntries(
    Object.entries(wording).filter(([key, sentence]) => {
      if (!isEditableKey(key)) return false;
      const base = baseSentence(tree, key);
      return base !== null && sentenceFits(base, sentence);
    }),
  );
}

/**
 * The tree with the replacements in place, as a new tree: only the branches
 * along a replaced key are copied, and the tree passed in is never changed
 * (it is the app's own, shared by every request).
 */
export function mergeWording(tree: MessageTree, wording: Wording): MessageTree {
  const keys = Object.keys(wording);
  if (keys.length === 0) return tree;
  const root: Record<string, string | MessageTree> = { ...tree };
  for (const key of keys) {
    const parts = key.split(".");
    const last = parts.pop();
    if (!last) continue;
    let node = root;
    for (const part of parts) {
      const next = node[part];
      if (typeof next !== "object" || next === null) {
        node = {};
        break;
      }
      const copy = { ...next };
      node[part] = copy;
      node = copy;
    }
    const sentence = wording[key];
    if (typeof node[last] === "string" && sentence !== undefined) {
      node[last] = sentence;
    }
  }
  return root;
}

export type SentenceProblem =
  | "notEditable"
  | "empty"
  | "tooLong"
  | "placeholders";

/**
 * A replacement the team typed, checked against the app's sentence: tidied,
 * not empty, not too long, and keeping every argument and tag. The ICU syntax
 * itself is checked where a formatter is at hand (the server).
 */
export function checkSentence(
  tree: MessageTree,
  key: string,
  input: unknown,
):
  | { ok: true; sentence: string; base: string }
  | { ok: false; problem: SentenceProblem } {
  const base = isEditableKey(key) ? baseSentence(tree, key) : null;
  if (base === null) return { ok: false, problem: "notEditable" };
  const sentence = typeof input === "string" ? input.trim() : "";
  if (sentence === "") return { ok: false, problem: "empty" };
  if (sentence.length > WORDING_MAX) return { ok: false, problem: "tooLong" };
  if (!sentenceFits(base, sentence)) {
    return { ok: false, problem: "placeholders" };
  }
  return { ok: true, sentence, base };
}
