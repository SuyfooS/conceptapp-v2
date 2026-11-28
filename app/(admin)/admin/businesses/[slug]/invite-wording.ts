import "server-only";
import { getWordingForTeam } from "@db/wording";
import type { Wording } from "@domain/wording";
import { wordingFrom } from "@/app/(app)/wording";

/**
 * Where the words an invite's link goes out with are (`InviteShare`): its
 * sentence, its "שליחה בוואטסאפ" and "נפתח בוואטסאפ".
 */
const INVITE_SHARE = "app.team.pending.";

/**
 * A business's sentences for what its invites' links go out with, its own
 * over its template's, each checked against the app's (`wordingFrom`), for
 * the console's screens that make a link: a business's page and "הוספת אדם".
 * The console has no business's `WordingProvider`, so without them the same
 * invite would read one way from /team and another from here. Only these:
 * the console's own words stay the app's. Read with the secret key, as the
 * console's wording page reads them; the pages check the person first.
 */
export async function inviteShareWording(businessId: string): Promise<Wording> {
  const stored = await getWordingForTeam(businessId);
  const sentences = (rows: readonly { key: string; sentence: string }[]) =>
    Object.fromEntries(rows.map((row) => [row.key, row.sentence]));
  const { overrides } = wordingFrom({
    template: sentences(stored.template),
    business: sentences(stored.business),
  });
  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) => key.startsWith(INVITE_SHARE)),
  );
}
