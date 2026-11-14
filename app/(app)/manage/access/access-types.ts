import type { Role } from "@domain/modules";
import type { PayRole } from "@domain/payroll-access";

/** Someone active in the business, as the access screen lists them. */
export type AccessPersonRow = {
  userId: string;
  name: string | null;
  photo: string | null;
  role: Role;
  /** Given pay access to them alone. */
  personal: boolean;
};

export type AccessData = {
  /** The roles the business gives pay access to. */
  roles: PayRole[];
  people: AccessPersonRow[];
  /**
   * Whoever is looking (the owner, or someone on the ConceptApp team in the
   * console), who is never offered to themselves.
   */
  me: string;
  /**
   * Nothing can be changed: someone from ConceptApp viewing the app as the
   * owner, or a team role in the console that only reads businesses.
   */
  viewOnly: boolean;
  /**
   * Documents are on (chat C7): whoever sees pay also reads the documents
   * people send the business, so the screen says so, with their count.
   */
  documents?: boolean;
};

export type AccessFailure =
  | "noAccess"
  | "notInTeam"
  | "always"
  | "viewOnly"
  /** The person switched business since the screen was drawn (payroll P3b). */
  | "businessChanged"
  /**
   * The console's alone: no module that is on uses pay access any more (the
   * time clock and chat went off since the screen was drawn).
   */
  | "notInUse"
  /**
   * The console's alone: someone on the team who is also in the business
   * can't change their own access (the database refuses it too).
   */
  | "self"
  | "failed";

export type AccessResult = { ok: true } | { ok: false; failure: AccessFailure };

/**
 * What the screen can do, bound by the page to the business it was drawn
 * for. The demo passes stand-ins that store nothing.
 */
export type AccessActions = {
  setRole: (role: PayRole, granted: boolean) => Promise<AccessResult>;
  setPerson: (personId: string, granted: boolean) => Promise<AccessResult>;
};

/**
 * Where the screen is drawn, and what it goes back to. The words that speak
 * to the reader follow it: in the app they speak to the owner; in the console
 * to someone on the ConceptApp team (its own words for what its role can't
 * do, and "the business" where the app says "the team").
 */
export type AccessPaths =
  /** The owner's screen in the app, back to managing the business. */
  | { place: "app"; manage: string }
  /** The team's in the console, back to the business's page, by its name. */
  | { place: "console"; business: string; name: string };
