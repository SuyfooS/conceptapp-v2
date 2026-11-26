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
