import type { ImportPerson } from "@domain/people-import";

/**
 * What the people import's actions answer, for the one view every route
 * draws (`PeopleImportView`): the Team screen's, the console's, and the
 * twins on /design, which stand in for them and write nothing.
 */

/** What the database did with one row it was sent. */
export type PeopleImportStatus =
  | "created"
  | "updated"
  | "same"
  | "member"
  | "invited"
  | "expired"
  /** An owner's or an accountant's invite, never changed by a list. */
  | "kept";

/**
 * Why nothing was written: each refusal writes nothing at all. The console's
 * `elsewhere`, with its rows, is a result of its own (`PeopleImportResult`).
 */
export type PeopleImportFailure =
  // The invite form's own words (`app.team.invite.errors`).
  | "noPermission"
  | "viewOnly"
  | "demo"
  | "notAllowed"
  | "givesPay"
  | "roleGone"
  // The import's (`app.team.import.errors`).
  | "businessChanged"
  | "changed"
  | "tooMany"
  | "tooManyOpen"
  | "failed";

export type PeopleImportResult =
  | {
      ok: true;
      /** The import's id, for its undo; null when it made no invite. */
      importId: string | null;
      /** One per row sent, `i` its place among them from 1. No link, no token. */
      rows: { i: number; status: PeopleImportStatus; invite: string | null }[];
    }
  | {
      ok: false;
      failure: PeopleImportFailure;
      /** With `tooManyOpen`: the invites the business has waiting. */
      open?: number;
    }
  | {
      ok: false;
      /**
       * The console's only: numbers on another business's staff, so nothing
       * was written. The Team screen never says where else a number works
       * (#80).
       */
      failure: "elsewhere";
      /** Their rows' places among those sent, from 1. */
      rows: number[];
    };

export type PeopleUndoResult =
  | {
      ok: true;
      /** The import's invites cancelled: those still with no link. */
      cancelled: number;
      /**
       * Those kept, still open: a link was made for them, so each can be
       * deleted on /team ("done.removedKept"). The database counts those
       * claimed apart (`joined` in @db/people-import), never as these.
       */
      kept: number;
    }
  | { ok: false; failure: PeopleImportFailure };

/** Invites the people sent, all or none. */
export type ImportPeople = (
  people: readonly ImportPerson[],
) => Promise<PeopleImportResult>;

/** Cancels an import's invites that still have no link. */
export type UndoPeopleImport = (importId: string) => Promise<PeopleUndoResult>;
