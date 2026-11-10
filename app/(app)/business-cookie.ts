import "server-only";
import { BUSINESS_COOKIE, BUSINESS_COOKIE_MAX_AGE } from "@domain/businesses";
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

/** Forget the choice, on signing out, so the next person starts afresh. */
export async function forgetBusiness(): Promise<void> {
  (await cookies()).delete(BUSINESS_COOKIE);
}
