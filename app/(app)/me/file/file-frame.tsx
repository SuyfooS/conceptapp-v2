"use client";

import {
  type AbstractIntlMessages,
  NextIntlClientProvider,
  useLocale,
} from "next-intl";
import type { CSSProperties, ReactNode } from "react";

/**
 * The frame the worker's own file is drawn in, the same element in either
 * language, so switching keeps every step's typing (a half-typed account,
 * the names, the birth date): only its words, direction and colour change.
 * In English, the file's words alone in a left-to-right frame that keeps the
 * business's colour (its sheets open inside it); in Hebrew the app's words
 * and direction, with a business's sentences, as the page already has them.
 */
export function FileFrame({
  english,
  messages,
  timeZone,
  accent,
  children,
}: {
  english: boolean;
  /** The file's English words: given only for English. */
  messages?: AbstractIntlMessages;
  timeZone: string;
  /** The business's colour (`accentProps`), for the English frame. */
  accent?: { "data-accent": string; style: CSSProperties };
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <NextIntlClientProvider
      locale={english ? "en" : locale}
      // Unset, the page's own: the app's Hebrew with the business's sentences.
      messages={english ? messages : undefined}
      timeZone={english ? timeZone : undefined}
    >
      <div
        dir={english ? "ltr" : undefined}
        lang={english ? "en" : undefined}
        {...(english ? accent : undefined)}
      >
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
