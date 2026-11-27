import type { Refusal } from "../../(auth)/otp";

/** The minutes a twin's network says it waits for. */
export const TWIN_NETWORK_MINUTES = 12;

/**
 * Why a twin of sign-in or joining opens refused, from its `?error=`:
 * `captcha`, a send the auth server refused for its "אני לא רובוט" check;
 * `network`, too many codes from this network, with its minutes (closing
 * the pilot, PR 2); anything else, nothing refused.
 */
export function refusalTwinOf(param?: string): Refusal | null {
  switch (param) {
    case "captcha":
      return { error: "captcha" };
    case "network":
      return { error: "tooManyNetwork", minutes: TWIN_NETWORK_MINUTES };
    default:
      return null;
  }
}
