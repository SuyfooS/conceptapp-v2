import { type KnownTeam, knownTeamOf } from "@domain/people-import";

/**
 * The team as the import screen reads it while an import is taken back: the
 * invites it made (`ids`) left out while they still wait with no link, as
 * the undo leaves them, whichever reading of the team the page has. The
 * page may still show its reading from before the import, or get the one
 * the import sent a moment later; read again after the undo, the team holds
 * them no more (cancelled), and one that got a link meanwhile stays, as the
 * undo keeps it.
 */
export function withoutTakenBack(
  known: KnownTeam,
  ids: ReadonlySet<string> | null,
): KnownTeam {
  if (!ids || ids.size === 0) return known;
  return knownTeamOf(
    known.members,
    known.invites.filter(
      (invite) => !(ids.has(invite.id) && invite.linkPending),
    ),
  );
}

/**
 * What taking an import back does now, as the screen reads the invites it
 * made (`ids`): those its undo cancels, still with no link, and how many it
 * keeps, since a link was made for them meanwhile, on this screen (`linked`:
 * the links made here, known before the page reads the team again) or as
 * the page last read the team (an invite it reads with its link made). One
 * the page doesn't read yet (its reading from before the import) still
 * waits. The done card offers the undo only while it cancels any, and hides
 * those alone (`withoutTakenBack`); its "ביטול" says both counts while it
 * holds.
 */
export function takeBackOf(
  ids: readonly string[],
  known: KnownTeam,
  linked: (id: string) => boolean,
): { cancels: readonly string[]; kept: number } {
  const read = new Map(known.invites.map((invite) => [invite.id, invite]));
  const cancels = ids.filter(
    (id) => !linked(id) && read.get(id)?.linkPending !== false,
  );
  return { cancels, kept: ids.length - cancels.length };
}
