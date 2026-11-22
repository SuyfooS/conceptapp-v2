/*
 * The pension funds a worker can name in their file (profile H5a): the
 * comprehensive new funds (קרנות חדשות), the kind a worker's pension is in,
 * as the Capital Market Authority's pension data names them, by the fund and
 * never a track. Dated data, like the banks: a new report is a new date and a
 * new list, by PR. A key no longer listed stays readable in a stored file;
 * the database checks only a key's shape.
 *
 * Names are in the messages under `pensionFunds.<key>`.
 */

/** The report period the list was taken from, YYYY-MM. */
export const PENSION_FUNDS_AS_OF = "2026-10";

export const PENSION_FUNDS_SOURCE = {
  /**
   * פנסיה-נט on data.gov.il (dataset pensia-net), report period 202610, as
   * updated on 21.11.2026; FUND_CLASSIFICATION "קרנות חדשות", one entry per
   * PARENT_COMPANY_ID.
   */
  dataset:
    "https://data.gov.il/dataset/pensia-net/resource/6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
  resource: "6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
} as const;

/** In the list's order on screen; `authorityId` is the fund's PARENT_COMPANY_ID. */
export const PENSION_FUNDS = [
  { key: "meitav", authorityId: 163 },
  { key: "migdal_makefet", authorityId: 162 },
  { key: "menora_mivtachim", authorityId: 168 },
  { key: "harel", authorityId: 214 },
  { key: "clal", authorityId: 170 },
  { key: "phoenix", authorityId: 209 },
  { key: "altshuler_shaham", authorityId: 1328 },
  { key: "mor", authorityId: 13908 },
  { key: "infinity", authorityId: 14036 },
] as const satisfies readonly { key: string; authorityId: number }[];

/** "אין לי את השם עכשיו": in a fund, its name not at hand. Always last. */
export const UNKNOWN_FUND = "unknown";

export type PensionFundKey =
  | (typeof PENSION_FUNDS)[number]["key"]
  | typeof UNKNOWN_FUND;

/** Every key a file may hold, the listed funds then "unknown". */
export const PENSION_FUND_KEYS: readonly PensionFundKey[] = [
  ...PENSION_FUNDS.map((fund) => fund.key),
  UNKNOWN_FUND,
];

export function isPensionFund(key: unknown): key is PensionFundKey {
  return (PENSION_FUND_KEYS as readonly unknown[]).includes(key);
}
