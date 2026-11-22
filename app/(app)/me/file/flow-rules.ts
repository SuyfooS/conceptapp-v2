import type { ProfileLocale } from "@domain/profile";

/*
 * The flow's small decisions (profile H5a), apart from its screens so each
 * can be held by a test: what step 0 saves of the language, when a saved
 * document needs its number again, and what keeps the account from going.
 */

/**
 * The language step 0 saves: one picked there that differs from the file's
 * now, or none. The file's own (`data.locale`) is the choice shown until the
 * person picks, and again after the language button changes it, so a save
 * never takes the file back to a language left behind.
 */
export function localeToSave(
  picked: ProfileLocale | null,
  current: ProfileLocale,
): ProfileLocale | null {
  return picked !== null && picked !== current ? picked : null;
}

/** A passport's or another document's details, as saved or as on screen. */
export type DocumentDetails = {
  country: string | null;
  expiresOn: string | null;
  /** Another document's name; null for a passport. */
  name: string | null;
};

/**
 * Whether a saved document of the same kind, opened with "תיקון" and its
 * number left empty, was changed in anything but the number: the document
 * goes whole or not at all, so its number is then asked for again rather
 * than the change dropped unsaid.
 */
export function documentChanged(
  stored: DocumentDetails,
  shown: DocumentDetails,
): boolean {
  return (
    stored.country !== shown.country ||
    stored.expiresOn !== shown.expiresOn ||
    (stored.name ?? "") !== (shown.name ?? "")
  );
}

/** What keeps an account typed in full from going, said above its action. */
export type BankBlock = "missing" | "other" | "unusable" | "warning" | null;

/**
 * The first thing in the account's way, in the order the person meets it:
 * something still empty (counted), someone else's account (the law allows
 * no one else's), a number that can't be kept at all, then a warning the
 * person hasn't kept with "המספר נכון, לשמור". Null when it can go.
 */
export function bankBlock(account: {
  empty: number;
  holderOther: boolean;
  unusable: boolean;
  warning: boolean;
  kept: boolean;
}): BankBlock {
  if (account.empty > 0) return "missing";
  if (account.holderOther) return "other";
  if (account.unusable) return "unusable";
  if (account.warning && !account.kept) return "warning";
  return null;
}
