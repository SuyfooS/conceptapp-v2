/**
 * Money (payroll, from P4): whole agorot, as integers, everywhere. The
 * database stores agorot, the rules add agorot, and a screen turns typed
 * shekels into agorot and agorot back into shekels. Nothing in between is a
 * float.
 */

/** The most an hourly wage may be: 1,000.00 ₪ (`public.set_hourly_wage` refuses more). */
export const MAX_HOURLY_AGOROT = 100_000;

/** Whole shekels, then up to two decimals after a point or a comma. */
const SHEKELS = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/**
 * What may sit around the number when it was pasted: spaces of any kind, the
 * shekel sign, and the direction marks formatted text carries.
 */
const AROUND = /[\s ‎‏⁦-⁩₪]/g;

/**
 * Shekels as someone types them, in agorot: "38", "38.5", "38.50", "38,50"
 * and " 38 ₪ " are all read. Null for anything else: nothing, more than two
 * decimals, a minus sign, a thousands separator, letters, or more than `max`
 * agorot (an hourly wage's 1,000.00 ₪ unless said).
 */
export function parseShekels(
  input: string,
  max: number = MAX_HOURLY_AGOROT,
): number | null {
  const match = SHEKELS.exec(input.replace(AROUND, ""));
  if (!match) return null;
  const [, whole = "0", decimals = ""] = match;
  const agorot = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(agorot) && agorot <= max ? agorot : null;
}

const GROUPS = {
  he: new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
} as const;

/**
 * Agorot as shekels with two decimals: "38.00 ₪" in Hebrew, "₪38.00" in
 * English, with thousands grouped ("1,000.00 ₪"). Worked out from the whole
 * number, so no amount ever reads a cent off. Screens put it in an LTR span.
 */
export function formatShekels(agorot: number, locale: "he" | "en"): string {
  const whole = Math.round(agorot);
  const sign = whole < 0 ? "-" : "";
  const size = Math.abs(whole);
  const shekels = GROUPS[locale].format(Math.floor(size / 100));
  const amount = `${shekels}.${String(size % 100).padStart(2, "0")}`;
  return locale === "he" ? `${sign}${amount} ₪` : `${sign}₪${amount}`;
}

/**
 * What `minutes` at an hourly wage and a rate (100 for 100%) come to, in whole
 * agorot: `Math.round(minutes × agorot × percent / 6000)`, so 347 minutes at
 * 38.00 ₪ and 100% are 21,977 agorot. Payroll rounds once per rate and per
 * wage, then adds the results (payroll plan §3, §14 accountant 10).
 */
export function minutesAgorot(
  minutes: number,
  hourlyAgorot: number,
  percent: number,
): number {
  return Math.round((minutes * hourlyAgorot * percent) / 6000);
}

/** The locale a screen speaks, as `formatShekels` takes it. */
export function moneyLocale(locale: string): "he" | "en" {
  return locale === "en" ? "en" : "he";
}
