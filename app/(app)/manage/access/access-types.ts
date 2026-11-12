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
  /** The owner looking, who is never offered to themselves. */
  me: string;
  /** Someone from ConceptApp is looking; nothing can be changed. */
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

export type AccessPaths = { manage: string };
