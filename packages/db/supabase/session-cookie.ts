import { combineChunks, stringFromBase64URL } from "@supabase/ssr";
import { z } from "zod";

/** What @supabase/ssr puts before a cookie it wrote in base64url. */
const BASE64_PREFIX = "base64-";

/** The session as supabase-js keeps it: only its access token is read. */
const StoredSession = z.object({ access_token: z.string() });

/** The access token's payload: only whose it is. */
const TokenClaims = z.object({ sub: z.guid() });

/**
 * Whose session a browser's cookies claim, unverified: the `sub` in the
 * payload of the access token the session cookie keeps (`sessionName`,
 * whole or cut into `.0`, `.1`…, and `base64-` encoded, as @supabase/ssr
 * writes it), or null where there is none or it can't be read. Never who
 * anyone is, and never a reason to read or show anything: only whose records
 * on the device go when the session itself couldn't be read as it signs out
 * (waiter mode P7), and deleting what the device holds gives nobody anything.
 */
export async function claimedSessionUser(
  cookies: readonly { name: string; value: string }[],
  sessionName: string,
): Promise<string | null> {
  const byName = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  try {
    const kept = await combineChunks(sessionName, (name) => byName.get(name));
    if (!kept) return null;
    const json = kept.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(kept.slice(BASE64_PREFIX.length))
      : kept;
    const session = StoredSession.safeParse(JSON.parse(json));
    if (!session.success) return null;
    const payload = session.data.access_token.split(".")[1];
    if (!payload) return null;
    const claims = TokenClaims.safeParse(
      JSON.parse(stringFromBase64URL(payload)),
    );
    return claims.success ? claims.data.sub : null;
  } catch {
    // Not base64url, not JSON: no session it can name.
    return null;
  }
}
