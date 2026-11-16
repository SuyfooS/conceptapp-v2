import type { ModuleIcon } from "@domain/modules";
import type {
  AccessArea,
  AreaAccess,
  BaseRole,
  RoleAccess,
} from "@domain/role-access";

/** Someone in a role, as the screen shows them: a face in its stack. */
export type RolePerson = { name: string; photo: string | null };

/** An area the business has: its module is on, or it is team or manage. */
export type RolesArea = {
  key: AccessArea;
  /** The module's own icon, from its manifest; team and manage have their own. */
  icon: ModuleIcon | null;
  /**
   * Its choices change: owners switch each of its permissions per role
   * (`areaOpen`), as its phase of the roles plan turns them on once every
   * check in the area reads them. Until then it is shown as it is, closed,
   * and says so.
   */
  open: boolean;
};

/** A role the owner changes: a manager, a worker, or one the business named. */
export type EditableRole = {
  /** "manager" or "worker", or the id of a role the business named. */
  key: string;
  base: BaseRole;
  /**
   * The business's own name for a role it named; null for a manager or a
   * worker, named in the business's words (`app.team.roles`).
   */
  name: string | null;
  /** Its English name, when the business gave one; null otherwise. */
  nameEn: string | null;
  people: RolePerson[];
  /**
   * Invites nobody claimed yet, and that haven't expired, to a role the
   * business named (the roles plan's R11b): each holds it as a person does,
   * so it can't be archived, and somebody is already on the way to it. Zero
   * for a manager or a worker, whose invites hold nothing back.
   */
  invited: number;
  access: RoleAccess;
  /** Sees everyone's hours and pay, as "מי רואה שכר" sets it. */
  seesPay: boolean;
};

export type RolesData = {
  /** In the order shown. */
  areas: RolesArea[];
  /** Managers, workers, then the roles the business named, oldest first. */
  roles: EditableRole[];
  owners: RolePerson[];
  accountants: RolePerson[];
  /**
   * Nothing changes: someone from ConceptApp viewing the business as its
   * owner, or a team role in the console that only reads businesses.
   */
  viewOnly: boolean;
  /**
   * Documents are on (chat C7, wherever chat is): whoever sees pay, the
   * accountants among them, also reads every document of the business
   * (private.in_office), so the screen says so wherever it says who sees pay.
   */
  documents: boolean;
};

export type RolesFailure =
  | "noAccess"
  | "viewOnly"
  /** The area isn't open for changes (yet, or since the screen was drawn). */
  | "closed"
  /** A switch whose area's edit the role lacks (the database refuses it). */
  | "requires"
  /**
   * The owner's alone: they switched business since the screen was drawn
   * (payroll P3b), so the change isn't written in the other one.
   */
  | "businessChanged"
  /** A role the business named, archived or gone since the screen was drawn. */
  | "gone"
  /** Another of the business's roles goes by the name. */
  | "taken"
  /** The business has as many roles of its own as it may (`ROLE_LIMIT`). */
  | "limit"
  /** People hold the role, so it can't go to the archive. */
  | "held"
  | "failed";

export type RolesResult = { ok: true } | { ok: false; failure: RolesFailure };

/** A role the owner adds: its name, what it counts as, and whose permissions it starts with. */
export type NewRole = { name: string; base: BaseRole; copyFrom: string };

/**
 * What the screen can do, bound by the page to the business it was drawn
 * for. The demo passes stand-ins that store nothing.
 */
export type RolesActions = {
  /** One area of a role, as it is now: a change, or the undo of one. */
  setArea: (
    role: string,
    area: AccessArea,
    access: AreaAccess,
  ) => Promise<RolesResult>;
  /**
   * Adds a role the business names (R11a), its key the new role's id.
   * Without it, and the three below, there is no "הוספת תפקיד", nor a way to
   * rename or archive one: before the database takes them.
   */
  addRole?: (
    role: NewRole,
  ) => Promise<
    { ok: true; key: string } | { ok: false; failure: RolesFailure }
  >;
  /** Gives a role the business named a new name. */
  renameRole?: (role: string, name: string) => Promise<RolesResult>;
  /**
   * Takes a role the business named off the list (refused while people hold
   * it), and takes back a role just added (its undo).
   */
  archiveRole?: (role: string) => Promise<RolesResult>;
  /** Brings an archived role back, with its rules (the archive's undo). */
  restoreRole?: (role: string) => Promise<RolesResult>;
};

/**
 * Where the screen is drawn, and what it goes back to. The words that speak
 * to the reader follow it: in the app they speak to the owner; in the console
 * to someone on the ConceptApp team.
 */
export type RolesPaths =
  /** The owner's screen in the app, back to managing the business. */
  (
    | { place: "app"; manage: string }
    /** The team's in the console, back to the business's page, by its name. */
    | { place: "console"; business: string; name: string }
  ) & {
    /**
     * "מי רואה שכר", where pay is given; null where pay opens nothing (no
     * module that is on uses it), so the screen says nothing of pay.
     */
    access: string | null;
    /**
     * Where a person is given a role: the team screen in the app, the
     * business's people in the console.
     */
    team: string;
  };
