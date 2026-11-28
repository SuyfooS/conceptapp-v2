"use client";

import { type MessageTree, mergeWording, type Wording } from "@domain/wording";
import {
  type AbstractIntlMessages,
  NextIntlClientProvider,
  useLocale,
  useMessages,
} from "next-intl";
import { type ReactNode, useMemo } from "react";

/**
 * A business's sentences for what the browser draws: only the sentences that
 * differ travel, merged here over the messages the page already has. A
 * nested provider replaces its parent's messages and keeps the rest (time
 * zone, formats, the error handler), so it gets the whole merged tree. The
 * same provider whatever the sentences, none among them: a page read again
 * (`refresh()`, `revalidatePath`) after a sentence was saved or cleared
 * elsewhere would otherwise change the element here, and React would draw
 * everything under it anew, a link just made and its focus gone. With none,
 * the tree is the page's own, so the provider changes nothing.
 */
export function WordingProvider({
  overrides,
  children,
}: {
  overrides: Wording;
  children: ReactNode;
}) {
  const messages = useMessages();
  const locale = useLocale();
  const merged = useMemo(
    () => mergeWording(messages as MessageTree, overrides),
    [messages, overrides],
  );
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={merged as AbstractIntlMessages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
