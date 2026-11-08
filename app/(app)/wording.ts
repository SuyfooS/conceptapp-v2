import "server-only";
import {
  type MessageTree,
  mergeWording,
  shownWording,
  type Wording,
} from "@domain/wording";
import {
  createTranslator,
  type NamespaceKeys,
  type NestedKeyOf,
} from "next-intl";
import { defaultLocale } from "@/i18n/config";
import he from "@/messages/he.json";

/**
 * The words a screen speaks: the app's messages with a business's sentences in
 * place (@domain/wording), and those sentences alone, which are all the
 * browser needs on top of what it already has. A value, passed down to every
 * view, so a screen reads the right words however Next.js orders or splits
 * its rendering, and /design pages can pass the app's own words without
 * reading anyone.
 */
export type AppWording = {
  readonly messages: typeof he;
  readonly overrides: Wording;
};

/** The app's own words: for screens outside a business, titles and demos. */
export const baseWording: AppWording = { messages: he, overrides: {} };

/**
 * A business's stored sentences and its template's, each checked against
 * the app's, layered and merged in.
 */
export function wordingFrom(stored: {
  template: Wording;
  business: Wording;
}): AppWording {
  const overrides = shownWording(
    he as MessageTree,
    stored.template,
    stored.business,
  );
  if (Object.keys(overrides).length === 0) return baseWording;
  return {
    messages: mergeWording(he as MessageTree, overrides) as typeof he,
    overrides,
  };
}

type Messages = typeof he;
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * A translator over these words, the same type getTranslations and
 * useTranslations give, so the views keep their helpers. Synchronous, so it
 * works in any server component.
 */
export function translator<N extends Namespace = never>(
  wording: AppWording,
  namespace?: N,
) {
  return createTranslator<Messages, N>({
    locale: defaultLocale,
    messages: wording.messages,
    namespace,
  });
}

/** What `translator` gives for a namespace. */
export type Translator<N extends Namespace = never> = ReturnType<
  typeof translator<N>
>;
