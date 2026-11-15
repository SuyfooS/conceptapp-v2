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
  people: RolePerson[];
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
  /** Someone from ConceptApp viewing the business as its owner: nothing changes. */
  viewOnly: boolean;
  /**
   * Documents are on (chat C7, wherever chat is): whoever sees pay, the
   * accountants among them, also reads every document of the business
   * (private.in_office), so the screen says so wherever it says who sees pay.
   */
  documents: boolean;
};

export type RolesFailure = "noAccess" | "viewOnly" | "failed";

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
  addRole: (
    role: NewRole,
  ) => Promise<
    { ok: true; key: string } | { ok: false; failure: RolesFailure }
  >;
  /** Takes back a role just added, which nobody holds yet (its undo). */
  removeRole: (role: string) => Promise<RolesResult>;
};

export type RolesPaths = {
  /** Back to managing the business. */
  manage: string;
  /** "מי רואה שכר", where pay is given. */
  access: string;
  /** The team screen, where a person's role is changed: how a role is given. */
  team: string;
};
