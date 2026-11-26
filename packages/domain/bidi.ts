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
