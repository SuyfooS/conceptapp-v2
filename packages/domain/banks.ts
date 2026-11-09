import { cleanTyped } from "./typed-text";

/*
 * The banks a wage can be paid into: Masav's participants, checked against the
 * Bank of Israel's appendix 302. Dated data, like the minimum wage: a new
 * source is a new date and a new list, by PR. A bank is stored by its code as
 * a number ("09" and "9" are bank 9), so the three-digit codes the Bank of
 * Israel announced on 13 January 2026 (no timeline yet) fit as they come:
 * https://boi.org.il/publications/pressreleases/13-1-26/
 *
 * Left out: the Palestinian Authority's banks in appendix 302 (37, 43, 49, 66,
 * 67, 73, 76, 82, 84, 89, 93). They clear cheques but are not Masav
 * participants; a worker paid there goes "directly to payroll".
 *
 * Names are in the messages under `banks.<code>`.
 */

export const BANKS_AS_OF = "2026-09-16";

export const BANKS_SOURCES = {
  /** Masav, account number checks, as of 16.09.2026. */
  masav:
    "https://masavprodstorage.blob.core.windows.net/masasv-prod-blob/wp-content/uploads/2026/09/2026-09-16-Bdikat_hukiot_Heshbon-.pdf",
  /** Bank of Israel, appendix 302, the list of bank codes (25.06.2025). */
  boi302: "https://boi.org.il/media/akvhnrdg/302.pdf",
} as const;

export type Bank = {
  code: number;
  /** The Masav group whose rule the account follows (34 → 10, 17 → 11, 26 and 52 → 31), or null. */
  group: number | null;
  /** The last day it took accounts, when it no longer does. */
  until?: string;
  /** Where its accounts went. */
  mergedInto?: number;
};

/** By code. */
export const BANKS: readonly Bank[] = [
  { code: 1, group: null }, // Isracard
  { code: 3, group: null }, // Esh Bank
  { code: 4, group: null }, // Bank Yahav
  { code: 6, group: null }, // Max It Finance
  { code: 9, group: null }, // Israel Post Finance, Masav's 16.09.2026 name for the Postal Bank
  { code: 10, group: null }, // Bank Leumi
  { code: 11, group: null }, // Discount Bank
  { code: 12, group: null }, // Bank Hapoalim
  // Union Bank: "merged into Mizrahi in December 2022" (Masav).
  { code: 13, group: null, until: "2022-12-31", mergedInto: 20 },
  { code: 14, group: null }, // Bank Otsar Ha-Hayal
  { code: 15, group: null }, // Ofek Credit Union
  { code: 17, group: 11 }, // Mercantile Bank
  { code: 18, group: null }, // One Zero
  { code: 20, group: null }, // Mizrahi Tefahot
  { code: 21, group: null }, // Nima Shefa Israel
  { code: 22, group: null }, // Citibank
  { code: 23, group: null }, // HSBC
  { code: 26, group: 31 }, // U-Bank
  { code: 31, group: null }, // First International Bank
  { code: 34, group: 10 }, // Arab Israel Bank
  { code: 35, group: null }, // GROW
  { code: 39, group: null }, // State Bank of India
  { code: 46, group: null }, // Bank Massad
  { code: 52, group: 31 }, // Bank PAGI
  { code: 54, group: null }, // Bank of Jerusalem
  { code: 58, group: null }, // Re-Weave
  { code: 69, group: null }, // GMT
  { code: 79, group: null }, // Monox
  { code: 94, group: null }, // Phoenix Gamma
];

const byCode = new Map(BANKS.map((bank) => [bank.code, bank]));

export function bankOf(code: number): Bank | undefined {
  return byCode.get(code);
}

/** The banks a person can pick on `day` (YYYY-MM-DD): the list without those closed by then, by code. */
export function banksOn(day: string): Bank[] {
  return BANKS.filter((bank) => !isClosedOn(bank, day));
}

/** Whether `bank` no longer takes accounts on `day`. */
export function isClosedOn(bank: Bank, day: string): boolean {
  return bank.until !== undefined && bank.until < day;
}

/** "09", "9" and " 9 " are bank 9; 1–3 digits, 1–999 (three-digit codes are coming); null otherwise. */
export function parseBankCode(input: string): number | null {
  const text = cleanTyped(input).trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const code = Number(text);
  return code >= 1 ? code : null;
}

/** Two digits until a code needs three: 9 → "09", 120 → "120". */
export function formatBankCode(code: number): string {
  return String(code).padStart(2, "0");
}
