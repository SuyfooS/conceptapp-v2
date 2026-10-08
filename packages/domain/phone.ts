/**
 * Israeli mobile numbers. The phone number is a person's identity in
 * ConceptApp (login, invites, guest bookings), so every number is stored in
 * one canonical form: E.164, e.g. "+972501234567".
 *
 * Accepted input: 050-123-4567, 0501234567, 501234567, +972 50 123 4567,
 * 972501234567, +972 050 123 4567 (a stray 0 after the country code).
 */

const LOCAL_MOBILE = /^05\d{8}$/;

/** Digits only, with any 972 country code turned back into a leading 0. */
function toLocalDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("972")) {
    digits = digits.slice(3);
    if (!digits.startsWith("0")) digits = `0${digits}`;
  }
  return digits;
}

/** Canonical E.164 form, or null when the input is not an Israeli mobile number. */
export function normalizeIsraeliMobile(input: string): string | null {
  let local = toLocalDigits(input);
  if (/^5\d{8}$/.test(local)) local = `0${local}`;
  if (!LOCAL_MOBILE.test(local)) return null;
  return `+972${local.slice(1)}`;
}

export function isIsraeliMobile(input: string): boolean {
  return normalizeIsraeliMobile(input) !== null;
}

/**
 * Progressive display format while typing: "050", "050-123", "050-123-4567".
 * Never longer than 10 digits.
 */
export function formatIsraeliMobile(input: string): string {
  const d = toLocalDigits(input).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "+972501234567" → "050-123-4567". Returns the input unchanged if it is not a valid number. */
export function displayIsraeliMobile(e164: string): string {
  const normalized = normalizeIsraeliMobile(e164);
  if (!normalized) return e164;
  return formatIsraeliMobile(`0${normalized.slice(4)}`);
}
