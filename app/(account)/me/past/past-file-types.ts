import type { Departure } from "@db/team";
import type { Address } from "@domain/address";
import type { City } from "@domain/cities";
import type { EmergencyContact, FileRow } from "@domain/employee-file";
import type { ProfileLocale } from "@domain/profile";
import type { TaxYearRow } from "../../../(app)/me/file/file-types";

/*
 * What a former worker's own file (profile H5c, /me/past/<business>) is
 * drawn from: the same for the app and its twin on /design. Their values
 * travel in the screen's props for their own session only, never a URL or a
 * cache; the ID and the account number never do, only their last digits,
 * and "הצגה" asks for each on its own.
 */

/** A business the person left, as `own_departures` names it: its name, colour and when. */
export type PastJob = Departure;

/**
 * Where "back" goes: the profile, for someone in a business now, or the
 * screen of someone with none, whose list of previous jobs led here.
 */
export type PastBack = "profile" | "list";

/** What every state of the screen is drawn in: the business left, their language, the way back. */
export type PastFrame = {
  job: PastJob;
  locale: ProfileLocale;
  back: PastBack;
};

export type PastFileData = PastFrame & {
  /** A demo business: its file is made up. */
  demo: boolean;
  file: FileRow | null;
  address: Address | null;
  /** The address's town, named. */
  city: City | null;
  email: string | null;
  workLanguage: string | null;
  /** Another document's name. */
  documentName: string | null;
  /** A relative holder's name. */
  holderName: string | null;
  /** Their emergency contact, opened (E.164): managers no longer see it. */
  emergency: EmergencyContact | null;
  /** The two numbers as their last digits only ("•••0018"). */
  masked: { id: string | null; bankAccount: string | null };
  /** Every Form 101 year the file holds. */
  taxYears: TaxYearRow[];
};

/** Why the screen can't show the old file, or the file. */
export type PastFileScreen =
  /**
   * No such screen for them: not an id, nobody signed in, a business they
   * never were in or are back in.
   */
  | { kind: "closed" }
  /**
   * The ConceptApp team viewing as a role (no file is read at all), the
   * module off there now, nothing of theirs in it, or no keys here.
   */
  | ({ kind: "viewing" | "off" | "empty" | "unavailable" } & PastFrame)
  | { kind: "file"; data: PastFileData };
