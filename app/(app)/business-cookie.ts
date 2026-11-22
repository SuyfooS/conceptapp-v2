import "server-only";
import {
  BUSINESS_COOKIE,
  BUSINESS_COOKIE_MAX_AGE,
  DEPARTURE_SEEN_COOKIE,
} from "@domain/businesses";
import {
  BANK_CHANGE_SEEN_COOKIE,
  type BankChange,
  withBankChangeSeen,
} from "@domain/employee-file-settings";
import {
  FIRST_STEPS_HIDDEN_COOKIE,
  withFirstStepsHidden,
} from "@domain/first-steps";
import { cookies } from "next/headers";
import { requestOrigin } from "@/app/origin";

/**
 * The cookie that says which of their businesses the person works in
 * (payroll P3b). It only ever asks: @db/session checks it against the
 * person's active memberships on every request, so a business they aren't in
 * is never opened, whatever it says. httpOnly, a year, and Secure wherever
 * the app runs on https (the browser tests run on http://127.0.0.1, where a
 * Secure cookie would be dropped).
 */
export async function businessCookieOptions() {
  const secure = (await requestOrigin()).startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: BUSINESS_COOKIE_MAX_AGE,
  };
}

/** Work in this business from now on. Callers check it is one of theirs. */
export async function rememberBusiness(businessId: string): Promise<void> {
  (await cookies()).set(
    BUSINESS_COOKIE,
    businessId,
    await businessCookieOptions(),
  );
}

/**
 * The person said they saw that they are no longer on the team of a business
 * they left at `leftAt` (`DepartureNotice`): on this device it isn't said
 * again, nor any departure before it (`departureToTell`). Kept as the
 * business cookie is.
 */
export async function rememberDepartureSeen(leftAt: string): Promise<void> {
  (await cookies()).set(
    DEPARTURE_SEEN_COOKIE,
    leftAt,
    await businessCookieOptions(),
  );
}

/**
 * The owner hid this business's first steps on Today: on this device they
 * aren't drawn again (`firstStepsHidden`), and another business's hidden
 * here stay hidden. Kept as the business cookie is.
 */
export async function rememberFirstStepsHidden(
  businessId: string,
): Promise<void> {
  const jar = await cookies();
  jar.set(
    FIRST_STEPS_HIDDEN_COOKIE,
    withFirstStepsHidden(jar.get(FIRST_STEPS_HIDDEN_COOKIE)?.value, businessId),
    await businessCookieOptions(),
  );
}

/**
 * The person saw their account's last change in this business, at
 * `changedAt`, the change's own moment in the database ("אני שיניתי",
 * "הבנתי" on Today, checked against the file by /home/bank-seen: `said`;
 * or the account they just added here, by the moment its save was dated
 * with, which the database keeps as the change's: `made`): on this device
 * Today doesn't tell that change again (`bankChangeSeen`), and the bank
 * step doesn't ask "לא שיניתי" of one made here, while a later one is told,
 * and so is anyone else's who signs in here. What others saw here, and in
 * other businesses, stays seen. Kept as the business cookie is.
 */
export async function rememberBankChangeSeen(
  change: BankChange,
  as: "made" | "said" = "said",
): Promise<void> {
  const jar = await cookies();
  jar.set(
    BANK_CHANGE_SEEN_COOKIE,
    withBankChangeSeen(jar.get(BANK_CHANGE_SEEN_COOKIE)?.value, change, as),
    await businessCookieOptions(),
  );
}

/**
 * Forget the choice, the departures seen, the first steps hidden and the
 * bank changes seen, on signing out, so the next person starts afresh.
 */
export async function forgetBusiness(): Promise<void> {
  const jar = await cookies();
  jar.delete(BUSINESS_COOKIE);
  jar.delete(DEPARTURE_SEEN_COOKIE);
  jar.delete(FIRST_STEPS_HIDDEN_COOKIE);
  jar.delete(BANK_CHANGE_SEEN_COOKIE);
}
