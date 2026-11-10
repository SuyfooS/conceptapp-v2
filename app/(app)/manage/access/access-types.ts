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
};

export type AccessFailure =
  | "noAccess"
  | "notInTeam"
  | "always"
  | "viewOnly"
  | "failed";

export type AccessResult = { ok: true } | { ok: false; failure: AccessFailure };

/** What the screen can do. The demo passes stand-ins that store nothing. */
export type AccessActions = {
  setRole: (role: PayRole, granted: boolean) => Promise<AccessResult>;
  setPerson: (personId: string, granted: boolean) => Promise<AccessResult>;
};

export type AccessPaths = { manage: string };
