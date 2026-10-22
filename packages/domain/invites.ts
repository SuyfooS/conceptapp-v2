/**
 * Invite links: `/join/<token>`. The token is 32 random bytes in base64url
 * (43 characters); the database keeps only its SHA-256, so a link cannot be
 * rebuilt from a stored invite and a fresh one replaces the old.
 */
export const INVITE_TOKEN_LENGTH = 43;

const TOKEN = new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`);

/** True when the text has the shape of an invite token (not that one exists). */
export function isInviteToken(input: string): boolean {
  return TOKEN.test(input);
}

/** Invites stay open this long after their link was issued. */
export const INVITE_DAYS = 14;

/** What a link can still do: join, or nothing because it was used or ran out. */
export const INVITE_STATUSES = ["open", "claimed", "expired"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** The link to send, on the app's own origin (scheme and host, no path). */
export function inviteLink(origin: string, token: string): string {
  const url = new URL(origin);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The origin must have no path, query or fragment");
  }
  if (!isInviteToken(token)) throw new Error("Not an invite token");
  return `${url.origin}/join/${token}`;
}

/**
 * The last four digits of an E.164 number, so the join screen can say where
 * the code goes without showing the whole number to whoever holds the link.
 */
export function phoneEnding(e164: string): string {
  return e164.replace(/\D/g, "").slice(-4);
}
