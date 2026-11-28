/**
 * Left-to-right isolates for words that are plain text, not drawn as markup:
 * a button's name and tooltip, an UndoRow's message, a push line, a sentence
 * put together as text. Times, dates and numbers are held in LRI (U+2066) …
 * PDI (U+2069), as `<ltr>` holds them on screen. Left alone in a
 * right-to-left line, the dash between two times takes the line's direction,
 * and a tooltip draws "09:00–17:00" as "17:00–09:00". Screen readers don't
 * read the isolates: they are format characters.
 *
 * Shaped as next-intl's markup callback, so `t.markup(key, { ltr: isolate })`
 * holds every `<ltr>` of a sentence.
 */
export const LRI = "⁦";
export const PDI = "⁩";

export const isolate = (chunks: string) => `${LRI}${chunks}${PDI}`;

/** FIRST STRONG ISOLATE (U+2068): what it holds takes its own direction. */
export const FSI = "\u2068";

/**
 * A name put into a sentence that goes out as plain text (a business's, in
 * an invite's WhatsApp message), held in FSI … PDI: the name keeps its own
 * direction, Latin or Hebrew, from its first letter, and the sentence around
 * it keeps the sentence's. WhatsApp takes a message's direction from its
 * first letter outside any isolate, so a business named in Latin letters at
 * the start of a Hebrew sentence ("Bakery 12 מזמינים אותך…") would otherwise
 * lay the whole message out left to right. Any isolate or pop the name holds
 * itself is dropped first, so none of it closes this one early or leaves it
 * open.
 */
export const isolateName = (name: string) =>
  `${FSI}${name.replace(/[\u2066-\u2069]/g, "")}${PDI}`;
