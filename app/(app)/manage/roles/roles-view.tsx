"use client";

import { ROLES } from "@domain/modules";
import {
  type AccessArea,
  type AccessExtra,
  type AccessLevel,
  type AreaPart,
  areaAccess,
  areaChanged,
  BASE_ROLES,
  type BaseRole,
  changedAreas,
  checkRoleName,
  defaultAccess,
  editedAreas,
  editOrView,
  extraOpen,
  extrasOf,
  extrasTurned,
  heldBeyond,
  holdsExtra,
  levelChoices,
  namedRoleName,
  type PlaceArea,
  ROLE_LIMIT,
  ROLE_NAME_MAX,
  type RoleAccess,
  type RoleNameProblem,
  resetParts,
  withAreaAccess,
  withExtra,
  withLevel,
} from "@domain/role-access";
import { AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { type DataColumn, type DataRow, DataTable } from "@ui/data-table";
import { FieldRow } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { TextField } from "@ui/text-field";
import { VisibilityNote } from "@ui/visibility-note";
import {
  Calculator,
  ChevronRight,
  Crown,
  IdCard,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  type RefCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { moduleIcons } from "../../module-icons";
import type {
  EditableRole,
  NewRole,
  RolePerson,
  RolesActions,
  RolesArea,
  RolesData,
  RolesFailure,
  RolesPaths,
  RolesResult,
} from "./roles-types";

/** How long the way back stays on the toast. */
const UNDO_MS = 6000;

type Toast = {
  text: string;
  stamp: string;
  undo: (() => void) | null;
  /** What it undoes took the focus with it, so the way back takes it. */
  focus: boolean;
};

/** A number in a sentence, read left to right. */
const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The element while it is on the screen and can take the keyboard, else null. */
function reachable(element: HTMLElement | null): HTMLElement | null {
  return element?.isConnected &&
    element.getClientRects().length > 0 &&
    !element.matches(":disabled")
    ? element
    : null;
}

/** A role's "חזרה להתחלה" in the shape on the screen, of those drawn (`controls`). */
function shownReset(
  controls: ReadonlyMap<HTMLElement, string>,
  key: string,
): HTMLElement | null {
  for (const [element, role] of controls) {
    if (role === key && reachable(element)) return element;
  }
  return null;
}

/** An area's own icon: its module's, or the team's and the management page's. */
function areaIcon(area: RolesArea): ReactNode {
  if (area.icon) return moduleIcons[area.icon];
  return area.key === "team" ? <Users /> : <SlidersHorizontal />;
}

/** A role's mark: what it is built on, or a card for one the business named. */
function roleIcon(role: EditableRole): ReactNode {
  if (role.name !== null) return <IdCard />;
  return role.base === "manager" ? <UserCog /> : <UserRound />;
}

/** An area's name: its module's, in the business's words, or team or manage. */
function useAreaName() {
  const t = useTranslations("app.manage.roles");
  const tm = useTranslations("modules");
  return (area: AccessArea) =>
    editOrView(area) ? tm(`${area}.name`) : t(`areas.${area}`);
}

/**
 * A role's name: the business's own (in English its English one, when it gave
 * one), or the app's word for a manager or a worker.
 */
function useRoleName() {
  const tRoles = useTranslations("app.team.roles");
  const locale = useLocale();
  return (role: EditableRole) =>
    role.name === null
      ? tRoles(role.base)
      : namedRoleName({ name: role.name, nameEn: role.nameEn }, locale);
}

/**
 * What a role sees of pay, and how it changes: on "מי רואה שכר", by the
 * role's switch for a manager or a worker, and person by person for a role
 * the business named, which has no switch there. Short for the table's cell,
 * whose row leads there.
 */
function usePayWords() {
  const t = useTranslations("app.manage.roles");
  const seesKey = (role: EditableRole, documents: boolean, short: boolean) => {
    if (short) return role.seesPay ? "pay.everyone" : "pay.self";
    if (!role.seesPay) return "pay.own";
    return documents ? "pay.seesDocuments" : "pay.sees";
  };
  return (role: EditableRole, documents: boolean, short = false) => {
    const sees = t(seesKey(role, documents, short));
    if (role.name !== null) return `${sees} · ${t("pay.named")}`;
    return short ? sees : `${sees} · ${t("pay.where")}`;
  };
}

const linkClass =
  "inline-flex min-h-11 items-center font-medium text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent";

/** A named role's rename and removal, in its column's head on a computer. */
const headActionClass = `${linkClass} disabled:no-underline disabled:opacity-50`;

/**
 * For a role nobody holds yet: where it is given, on the team screen (the
 * business's people, in the console), in the words of where it is drawn.
 * The team screen gives the roles the business named too (the roles plan's
 * R11b: invited to, or changed to on a person's page); the console's people
 * page only managers and workers, so in the console a named role gets none,
 * as it would lead where it can't be done.
 */
function GiveRole({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(linkClass, className)}>
      {label}
    </Link>
  );
}

/**
 * Someone holds the role, or an open invite waits for it (R11b): it can't
 * be archived, and nobody needs to be sent to the team screen to give it.
 */
const heldBack = (role: EditableRole) =>
  role.people.length > 0 || role.invited > 0;

/** Under a named role's removal: what it does, or why it can't be done. */
const archiveWords = (role: EditableRole) =>
  role.people.length > 0
    ? ("named.archiveHeld" as const)
    : role.invited > 0
      ? ("named.archiveInvited" as const)
      : ("named.archiveHint" as const);

/**
 * Where a role is given, in the words of where it is drawn: the invites
 * waiting for it, once some do (R11b; someone is on the way already), else
 * for a role nobody holds, the way to give it, where it is given there.
 */
function GiveOrInvited({
  role,
  given,
  href,
  label,
  className,
}: {
  role: EditableRole;
  /** `href` gives the role (`givenThere`). */
  given: boolean;
  href: string;
  label: string;
  className?: string;
}) {
  const t = useTranslations("app.manage.roles");
  if (role.invited > 0) {
    return (
      <span className={cn("text-ink-2", className)}>
        {t("invited", { count: role.invited })}
      </span>
    );
  }
  return role.people.length === 0 && given ? (
    <GiveRole href={href} label={label} className={className} />
  ) : null;
}

/** Why an area's choices can't change yet, in one quiet line. */
function ClosedNote({ id, className }: { id: string; className?: string }) {
  const t = useTranslations("app.manage.roles");
  return (
    <VisibilityNote icon="lock" className={className}>
      <span id={id}>{t("closed")}</span>
    </VisibilityNote>
  );
}

const markClass =
  "grid shrink-0 place-items-center bg-accent-soft text-accent [&_svg]:stroke-[1.8]";

/**
 * Roles and permissions, for the owner (roles plan, step 4b; Orel's answers
 * of 15 November 2026, issue #1): what each role sees and does in each area.
 * The four modules are view at least, so each is "עריכה" on or off, with the
 * switches under it, on by default once it is on (publishing, sending lists,
 * a message to the whole team, sending documents); the team screen and the
 * management page are edit, view or none. Owners and accountants are fixed,
 * and pay is given on "מי רואה שכר", so its row leads there. Every change
 * shows at once and saves, with its undo on the toast; "הוספת תפקיד" adds a
 * role the business names, built on a manager or a worker, starting with
 * another role's permissions, and a manager or a worker nobody holds yet
 * leads to the team screen, where it is given (a named role, from R11b).
 * Phone: the roles, then one role on a screen of
 * its own, a step in the history (`?role=`); tablet: the roles beside the
 * chosen one; desktop: every area against every role in one table, team and
 * manage as a menu in each narrow cell. Over mock data on
 * /design/shell/manage/roles; over the database's answer for the owner
 * (`/manage/roles`, R9) and in the console (`/admin/businesses/[slug]/roles`,
 * R2), where an area changes only once its phase opens it
 * (`RolesArea.open`), and says so until then. A role the business named
 * (R11a) is renamed and removed from its own card (its column's head, on a
 * computer), removing refused while people hold it; each with its undo. At
 * the business's `ROLE_LIMIT` "הוספת תפקיד" is off, and a line says why.
 * Without `addRole` (a database that doesn't take them yet) none is added.
 * An area that differs from where its role started (R10; Orel, 16 November
 * 2026: for a manager or a worker what every business starts with, for a
 * role the business named its base as it is) says "שונה", in its card and
 * in its cell of the table, and while any does the role has "חזרה להתחלה"
 * (under its cards, in its column's head): every such area back in one
 * write, with one toast and its undo.
 */
export function RolesView({
  data,
  actions,
  paths,
  initialRole,
}: {
  data: RolesData;
  actions: RolesActions;
  paths: RolesPaths;
  /** The role shown first: on a phone, open on its own screen. */
  initialRole?: string;
}) {
  const t = useTranslations("app.manage.roles");
  const tManage = useTranslations("app.manage");
  const tRoles = useTranslations("app.team.roles");
  const tAccess = useTranslations("app.manage.access");
  const tConsole = useTranslations("admin.permissions");
  const format = useFormatter();
  const areaName = useAreaName();
  const roleName = useRoleName();
  const payWords = usePayWords();
  const id = useId();

  const [roles, setRoles] = useState<EditableRole[]>(data.roles);
  const opening = data.roles.find((role) => role.key === initialRole);
  const [chosen, setChosen] = useState<string | null>(
    opening?.key ?? data.roles[0]?.key ?? null,
  );
  // A phone shows the roles, or one of them on a screen of its own.
  const [phoneOpen, setPhoneOpen] = useState(opening !== undefined);
  const [adding, setAdding] = useState(false);
  // The named role whose name the sheet changes, kept while it closes.
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [failure, setFailure] = useState<RolesFailure | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toasts = useRef(0);
  const phoneHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  /** The tablet's chosen role's name, beside the list. */
  const chosenHeading = useRef<HTMLHeadingElement>(null);
  /** Each "חזרה להתחלה" drawn (one a shape), by its role, while it is. */
  const resetControls = useRef(new Map<HTMLElement, string>());
  /**
   * The role whose "חזרה להתחלה" takes the keyboard again as it comes back
   * (its undo pressed, or its write refused), as the keyboard was on it.
   */
  const focusReset = useRef<string | null>(null);
  /** The row that opened the phone's role screen, for the way back. */
  const opener = useRef<HTMLElement | null>(null);
  const focusNext = useRef<"heading" | "opener" | null>(null);
  /**
   * The phone's role screen is a step in the history (`?role=`), so the
   * phone's own back closes it: set while the step before is the list.
   */
  const pushed = useRef(false);
  /** Where the keyboard was before it went to the toast, to go back to as its button goes. */
  const lastFocus = useRef<HTMLElement | null>(null);

  const disabled = data.viewOnly;
  const opened = (area: AccessArea) =>
    data.areas.some((shown) => shown.key === area && shown.open);
  const anyOpen = data.areas.some((area) => area.open);
  /**
   * While no area is open, the screen's one line says so for all of them,
   * and every control points to it; once some are, a closed one says it
   * under its own name.
   */
  const closedAllId = anyOpen ? null : `${id}-closed-all`;
  const inConsole = paths.place === "console";
  /** What went wrong: in the console, what a team role can't do, in its words. */
  const failureWords = (what: RolesFailure) =>
    inConsole && (what === "noAccess" || what === "viewOnly")
      ? tConsole(`failure.${what}`)
      : t.rich(`failure.${what}`, { max: ROLE_LIMIT, ltr });
  const giveLabel = inConsole ? tConsole("emptyRole") : t("emptyRole");
  /**
   * Whether the role is given where `paths.team` leads: the app's team
   * screen gives every role here, named ones too (the roles plan's R11b);
   * the console's people page only managers and workers.
   */
  const givenThere = (target: EditableRole) =>
    !inConsole || target.name === null;
  const chosenRole = roles.find((r) => r.key === chosen) ?? null;
  // A role taken back (the undo of adding it) leaves the first one chosen.
  const role = chosenRole ?? roles[0] ?? null;
  const phoneRole = phoneOpen ? chosenRole : null;
  const areas = data.areas.map((area) => area.key);
  /**
   * Where workers hold more than managers, while managers edit the team: a
   * manager then gives no one the worker role (`heldBeyond`; R6's rule,
   * private.role_holds_beyond), so the managers' and the workers' areas say
   * so, as does a line above the table.
   */
  const managers = roles.find((r) => r.key === "manager");
  const workers = roles.find((r) => r.key === "worker");
  const beyond =
    managers && workers && managers.access.levels.team === "edit"
      ? heldBeyond(managers.access, workers.access, areas)
      : [];
  const beyondNote =
    beyond.length > 0
      ? t("beyond", {
          areas: format.list(beyond.map(areaName), { type: "conjunction" }),
        })
      : null;

  // The focus follows the phone's screens: to the role's title as it opens,
  // back to its row in the list as it closes (to the list's title when the
  // screen opened on the role, with no row pressed).
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === "heading" && phoneOpen) {
      phoneHeading.current?.focus({ preventScroll: true });
    }
    if (next === "opener" && !phoneOpen) {
      const row = opener.current?.isConnected ? opener.current : null;
      (row ?? listHeading.current)?.focus({ preventScroll: true });
    }
  }, [phoneOpen]);

  // The phone's back and forward move between the roles and a role's screen,
  // as the address says.
  useEffect(() => {
    function onPopState() {
      const key = new URLSearchParams(window.location.search).get("role");
      pushed.current = key !== null;
      if (key === null) {
        focusNext.current = "opener";
        setPhoneOpen(false);
        return;
      }
      focusNext.current = "heading";
      setChosen(key);
      setPhoneOpen(true);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // "חזרה להתחלה" back on the screen after its write was refused, while the
  // keyboard waited by the role's name: it takes the keyboard again. (Its
  // undo's way back is the toast's, below, which comes first.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: it looks once the roles are drawn again
  useEffect(() => {
    const waiting = focusReset.current;
    if (waiting === null) return;
    focusReset.current = null;
    shownReset(resetControls.current, waiting)?.focus({ preventScroll: true });
  }, [roles]);

  /**
   * As the toast's button goes with the focus (its undo pressed, or its time
   * up): to the "חזרה להתחלה" its undo brought back, else back to where the
   * keyboard was, while it is still there to take it, the page staying where
   * it is; else to the title shown.
   */
  function focusAfterToast() {
    const waiting = focusReset.current;
    focusReset.current = null;
    const kept =
      (waiting === null ? null : shownReset(resetControls.current, waiting)) ??
      reachable(lastFocus.current);
    if (kept) {
      kept.focus({ preventScroll: true });
      return;
    }
    (
      reachable(phoneHeading.current) ?? reachable(listHeading.current)
    )?.focus();
  }

  /** Keeps each "חזרה להתחלה" drawn by its role, for the keyboard to come back to. */
  const resetRef =
    (key: string): RefCallback<HTMLElement> =>
    (element) => {
      if (element === null) return undefined;
      resetControls.current.set(element, key);
      return () => {
        resetControls.current.delete(element);
      };
    };

  /**
   * As a role's "חזרה להתחלה" goes with what it put back: the keyboard, on it
   * or on nothing, waits on the role's name (`anchor`), which stays, the page
   * staying where it is. There a refusal, the toast's time and its undo find
   * it.
   */
  function holdBy(anchor: HTMLElement | null) {
    const active = document.activeElement;
    const free =
      active === null ||
      active === document.body ||
      (active instanceof HTMLElement && resetControls.current.has(active));
    if (!free || !anchor?.isConnected) return;
    anchor.focus({ preventScroll: true });
    lastFocus.current = anchor;
  }

  /**
   * What just happened, on the toast; `focus` when the control pressed went
   * with what it did (a role removed), so the keyboard lands on the way back
   * rather than at the top of the page.
   */
  function say(text: string, undo: (() => void) | null = null, focus = false) {
    toasts.current += 1;
    setToast({ text, stamp: String(toasts.current), undo, focus });
  }

  function update(key: string, next: (access: RoleAccess) => RoleAccess) {
    setRoles((all) =>
      all.map((r) => (r.key === key ? { ...r, access: next(r.access) } : r)),
    );
  }

  async function run(
    write: () => Promise<RolesResult>,
    revert: () => void,
  ): Promise<boolean> {
    try {
      const result = await write();
      if (result.ok) {
        setFailure(null);
        return true;
      }
      setFailure(result.failure);
    } catch {
      setFailure("failed");
    }
    revert();
    return false;
  }

  /**
   * What a change did, in one sentence: what the role now does in the area,
   * with the switches it took along, or one switch.
   */
  function changeWords(
    name: string,
    area: AccessArea,
    before: RoleAccess,
    after: RoleAccess,
  ): string {
    const on = extrasTurned(before, after, true);
    const off = extrasTurned(before, after, false);
    const phrase = (extra: AccessExtra) => t(`extras.${extra}.phrase`);
    const list = (extras: AccessExtra[]) =>
      format.list(extras.map(phrase), { type: "conjunction" });
    if (before.levels[area] === after.levels[area]) {
      const [extra] = on.length > 0 ? on : off;
      if (!extra) return t("done.undone");
      return t(on.length > 0 ? "done.extraOn" : "done.extraOff", {
        role: name,
        extra: phrase(extra),
      });
    }
    const values = { role: name, area: areaName(area) };
    switch (after.levels[area]) {
      case "edit":
        return on.length > 0
          ? t("done.editWith", { ...values, extras: list(on) })
          : t("done.edit", values);
      case "view":
        return off.length > 0
          ? t("done.viewWithout", { ...values, extras: list(off) })
          : t("done.view", values);
      case "none":
        return t("done.none", values);
    }
  }

  /** One area of a role, changed at once and saved, with its undo on the toast. */
  function change(target: EditableRole, area: AccessArea, next: RoleAccess) {
    const before = target.access;
    // Its controls are off: nothing changes in a view or a closed area.
    if (next === before || disabled || !opened(area)) return;
    const back = areaAccess(before, area);
    const forward = areaAccess(next, area);
    const words = changeWords(roleName(target), area, before, next);
    update(target.key, (access) => withAreaAccess(access, area, forward));
    void run(
      () => actions.setArea(target.key, area, forward),
      () => update(target.key, (access) => withAreaAccess(access, area, back)),
    ).then((done) => {
      if (!done) return;
      say(words, () => {
        update(target.key, (access) => withAreaAccess(access, area, back));
        void run(
          () => actions.setArea(target.key, area, back),
          () =>
            update(target.key, (access) =>
              withAreaAccess(access, area, forward),
            ),
        ).then((undone) => {
          if (undone) say(t("done.undone"));
        });
      });
    });
  }

  /**
   * "חזרה להתחלה" (the roles plan's R10): every open area of the role that
   * differs from where it started (`resetParts`), back as it starts, in one
   * write, with one toast whose undo puts each as it was. Its control goes
   * once nothing differs, so the keyboard goes to the undo, from the role's
   * name (`anchor`, where it waits meanwhile and goes as the toast goes),
   * and back to the control as a refusal or the undo brings it back.
   */
  function reset(target: EditableRole, anchor: HTMLElement | null) {
    if (disabled) return;
    const { forward, back } = resetParts(
      target.access,
      target.start,
      areas.filter(opened),
    );
    if (forward.length === 0) return;
    const put = (parts: readonly AreaPart[]) =>
      update(target.key, (access) =>
        parts.reduce(
          (next, part) => withAreaAccess(next, part.area, part.access),
          access,
        ),
      );
    holdBy(anchor);
    put(forward);
    void run(
      () => actions.setAreas(target.key, forward),
      () => {
        // Refused: the control comes back, and the keyboard still waiting
        // for it goes back to it.
        const active = document.activeElement;
        if (active === anchor || active === document.body) {
          focusReset.current = target.key;
        }
        put(back);
      },
    ).then((done) => {
      if (!done) return;
      say(
        t("done.reset", { role: roleName(target) }),
        () => {
          // The control comes back with the areas: the keyboard, on the
          // undo, goes to it.
          if (document.activeElement?.closest('[role="status"]')) {
            focusReset.current = target.key;
          }
          put(back);
          void run(
            () => actions.setAreas(target.key, back),
            () => {
              holdBy(anchor);
              put(forward);
            },
          ).then((undone) => {
            if (undone) say(t("done.undone"));
          });
        },
        true,
      );
    });
  }

  /** Adds a role, or says why not, for the sheet to show. */
  async function add(input: NewRole): Promise<RolesFailure | null> {
    const { addRole } = actions;
    if (!addRole) return "failed";
    let result: Awaited<ReturnType<typeof addRole>>;
    try {
      result = await addRole(input);
    } catch {
      return "failed";
    }
    if (!result.ok) return result.failure;
    const from = roles.find((r) => r.key === input.copyFrom);
    // It starts where its base is now (R10), as the database's default for
    // it is its base's rule.
    const base = roles.find((r) => r.key === input.base);
    const added: EditableRole = {
      key: result.key,
      base: input.base,
      name: input.name,
      nameEn: null,
      people: [],
      invited: 0,
      access: from ? from.access : defaultAccess(input.base),
      start: base ? base.access : defaultAccess(input.base),
      // Pay is the owner's switch on its own screen, never copied.
      seesPay: false,
    };
    setRoles((all) => [...all, added]);
    setChosen(added.key);
    setFailure(null);
    say(
      t("done.added", { name: input.name }),
      actions.archiveRole ? () => takeBack(added) : null,
    );
    return null;
  }

  /** The undo of adding a role: nobody holds it yet, and it goes to the archive. */
  function takeBack(added: EditableRole) {
    const { archiveRole } = actions;
    if (!archiveRole) return;
    const name = added.name ?? "";
    setRoles((all) => all.filter((r) => r.key !== added.key));
    void run(
      () => archiveRole(added.key),
      () => setRoles((all) => [...all, added]),
    ).then((done) => {
      if (done) say(t("done.addUndone", { name }));
    });
  }

  function setName(key: string, name: string) {
    setRoles((all) => all.map((r) => (r.key === key ? { ...r, name } : r)));
  }

  /**
   * A role the business named with a new name, at once, with its undo on the
   * toast; or why not, for the sheet to show.
   */
  async function rename(
    target: EditableRole,
    name: string,
  ): Promise<RolesFailure | null> {
    const { renameRole } = actions;
    const before = target.name;
    if (!renameRole || before === null) return "failed";
    let result: RolesResult;
    try {
      result = await renameRole(target.key, name);
    } catch {
      return "failed";
    }
    if (!result.ok) return result.failure;
    setName(target.key, name);
    setFailure(null);
    say(t("done.renamed", { name }), () => {
      setName(target.key, before);
      void run(
        () => renameRole(target.key, before),
        () => setName(target.key, name),
      ).then((undone) => {
        if (undone) say(t("done.undone"));
      });
    });
    return null;
  }

  /**
   * A role the business named off the list, at once, with its undo on the
   * toast (the database keeps it archived, for that). Refused while people
   * hold it, or an open invite waits for it: they need another role first,
   * and the invite deleting. The control pressed goes with the role (its
   * card, its column), so the keyboard goes to the undo.
   */
  function archive(target: EditableRole) {
    const { archiveRole, restoreRole } = actions;
    if (!archiveRole || target.name === null || disabled) return;
    if (heldBack(target)) {
      setFailure("held");
      return;
    }
    const name = roleName(target);
    const at = roles.findIndex((r) => r.key === target.key);
    const takeOff = () =>
      setRoles((all) => all.filter((r) => r.key !== target.key));
    const putBack = () =>
      setRoles((all) =>
        all.some((r) => r.key === target.key)
          ? all
          : [...all.slice(0, at), target, ...all.slice(at)],
      );
    // On a phone, from its own screen: back to the roles.
    if (phoneOpen && chosen === target.key) closeOnPhone();
    takeOff();
    void run(() => archiveRole(target.key), putBack).then((done) => {
      if (!done) return;
      say(
        t("done.archived", { name }),
        restoreRole
          ? () => {
              putBack();
              void run(() => restoreRole(target.key), takeOff).then(
                (undone) => {
                  if (undone) say(t("done.restored", { name }));
                },
              );
            }
          : null,
        true,
      );
    });
  }

  function startRename(target: EditableRole) {
    if (disabled || target.name === null) return;
    setRenameKey(target.key);
    setRenameOpen(true);
  }

  /** The address with the role shown first, or with none. */
  function addressFor(key: string | null): URL {
    const url = new URL(window.location.href);
    if (key === null) url.searchParams.delete("role");
    else url.searchParams.set("role", key);
    return url;
  }

  function openOnPhone(key: string, row: HTMLElement) {
    opener.current = row;
    focusNext.current = "heading";
    setChosen(key);
    setPhoneOpen(true);
    // A step in the history, so the phone's own back leads to the roles.
    window.history.pushState(null, "", addressFor(key));
    pushed.current = true;
    window.scrollTo({ top: 0 });
  }

  function closeOnPhone() {
    // Back through the history, as the phone's own back goes (onPopState).
    if (pushed.current) {
      window.history.back();
      return;
    }
    // The screen opened on the role (`?role=`): it closes in place, and the
    // address no longer opens it.
    window.history.replaceState(null, "", addressFor(null));
    focusNext.current = "opener";
    setPhoneOpen(false);
  }

  const people = (list: readonly RolePerson[]) =>
    t("people", { count: list.length });

  function summary(access: RoleAccess): string {
    const edited = editedAreas(access, areas);
    if (edited.length === 0) return t("summary.none");
    if (edited.length === areas.length) return t("summary.all");
    return t("summary.some", {
      areas: format.list(edited.map(areaName), { type: "conjunction" }),
    });
  }

  /** Under a role's name: what it is built on (one the business named), how many hold it. */
  function about(target: EditableRole): string {
    const parts = [people(target.people)];
    if (target.name !== null) {
      parts.unshift(t("builtOn", { role: tRoles(target.base) }));
    }
    return parts.join(" · ");
  }

  /** The open areas where a role differs from where it started: what "חזרה להתחלה" puts back. */
  const resettable = (target: EditableRole) =>
    changedAreas(target.access, target.start, areas.filter(opened));
  /** How many of a role's areas say "שונה", in words beside its name in the list; none, nothing. */
  const changedWords = (target: EditableRole): string | null => {
    const count = changedAreas(target.access, target.start, areas).length;
    return count > 0 ? t("changedAreas", { count }) : null;
  };
  /**
   * Where "חזרה להתחלה" puts a role, in words: for a manager or a worker,
   * what every business starts with; for a role the business named, as its
   * base is.
   */
  const resetHint = (target: EditableRole) =>
    target.name === null
      ? t("reset.hintBase")
      : t("reset.hintNamed", { base: tRoles(target.base) });

  const stack = (list: readonly RolePerson[], size: "sm" | "md" = "sm") =>
    list.length > 0 ? <AvatarStack people={list} size={size} max={3} /> : null;

  // Whoever sees pay is in the office, which reads every document of the
  // business while documents are on (private.in_office): the accountants too.
  const accountantSees = t(
    data.documents ? "accountantDocuments" : "accountant",
  );
  const fixedNote = t(data.documents ? "fixedNoteDocuments" : "fixedNote");
  /** "מי רואה שכר", where pay opens something: nothing leads there otherwise. */
  const payLink = paths.access ? { href: paths.access } : {};

  /**
   * The roles, in rank order, the fixed ones at either end. Each says how
   * many hold it in words, and how many of its areas say "שונה" (R10), as
   * its column's head does on a computer; their faces show where there is
   * room for them (beside the chosen role, and in the table's heads).
   */
  function roleList(shape: "phone" | "tablet") {
    return (
      <PageSection title={t("list")}>
        <ListGroup>
          <ListRow
            leading={<Crown />}
            title={tRoles("owner")}
            subtitle={`${people(data.owners)} · ${t("owner")}`}
          />
          {roles.map((r) => {
            const changes = changedWords(r);
            return (
              <ListRow
                key={r.key}
                onClick={(event) =>
                  shape === "phone"
                    ? openOnPhone(r.key, event.currentTarget)
                    : setChosen(r.key)
                }
                current={shape === "tablet" && r.key === role?.key}
                leading={roleIcon(r)}
                title={roleName(r)}
                subtitle={`${about(r)} · ${summary(r.access)}${changes ? ` · ${changes}` : ""}`}
              />
            );
          })}
          <ListRow
            {...payLink}
            leading={<Calculator />}
            title={tRoles("accountant")}
            subtitle={`${people(data.accountants)} · ${accountantSees}`}
          />
        </ListGroup>
        <VisibilityNote icon="lock" className="px-1">
          {fixedNote}
        </VisibilityNote>
      </PageSection>
    );
  }

  /** One role's areas, a card each, and the way to its pay. */
  function roleAreas(target: EditableRole, headingLevel: 2 | 3) {
    const between = target.key === "manager" || target.key === "worker";
    return (
      <div className="flex flex-col gap-4">
        {beyondNote && between ? (
          <VisibilityNote icon="lock" className="px-1">
            {beyondNote}
          </VisibilityNote>
        ) : null}
        {data.areas.map((area) => (
          <AreaCard
            key={area.key}
            area={area}
            role={target}
            headingLevel={headingLevel}
            disabled={disabled}
            closedAllId={closedAllId}
            changed={areaChanged(target.access, target.start, area.key)}
            onChange={(next) => change(target, area.key, next)}
          />
        ))}
        {/* Back to where it started, while some area differs (R10). */}
        {resettable(target).length > 0 ? (
          <div className="flex flex-col items-start gap-1">
            <Button
              ref={resetRef(target.key)}
              variant="secondary"
              disabled={disabled}
              aria-describedby={`${id}-reset-${headingLevel}`}
              // The role's name stays while this goes: on a phone its
              // screen's title, beside the list its name there.
              onClick={() =>
                reset(
                  target,
                  headingLevel === 2
                    ? phoneHeading.current
                    : chosenHeading.current,
                )
              }
            >
              <RotateCcw aria-hidden="true" />
              {t("reset.action")}
            </Button>
            <p
              id={`${id}-reset-${headingLevel}`}
              className="px-1 text-ink-2 text-sm"
            >
              {resetHint(target)}
            </p>
          </div>
        ) : null}
        {paths.access ? (
          <ListGroup>
            <ListRow
              href={paths.access}
              leading={<Wallet />}
              title={t("pay.title")}
              subtitle={payWords(target, data.documents)}
            />
          </ListGroup>
        ) : null}
        {target.name !== null && actions.renameRole ? (
          <ListGroup>
            <ListRow
              leading={<Pencil />}
              title={t("named.rename")}
              disabled={disabled}
              onClick={() => startRename(target)}
            />
          </ListGroup>
        ) : null}
        {/* A removal, as the lists' "הסרת הרשימה": no way on, no chevron. */}
        {target.name !== null && actions.archiveRole ? (
          <div className="flex flex-col items-start gap-1">
            <Button
              variant="ghost"
              className="text-danger"
              disabled={disabled || heldBack(target)}
              aria-describedby={`${id}-remove-${headingLevel}`}
              onClick={() => archive(target)}
            >
              <Trash2 aria-hidden="true" />
              {t("named.archive")}
            </Button>
            <p
              id={`${id}-remove-${headingLevel}`}
              className="px-1 text-ink-2 text-sm"
            >
              {t(archiveWords(target))}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const renaming =
    roles.find((r) => r.key === renameKey && r.name !== null) ?? null;

  // Roles a business names (R11a): no way to add one without its action,
  // and none past the business's limit, which a line says before it is
  // tried (the database refuses the same: 54000).
  const full =
    actions.addRole !== undefined &&
    !disabled &&
    roles.filter((r) => r.name !== null).length >= ROLE_LIMIT;
  const fullId = `${id}-full`;
  const addAction = actions.addRole ? (
    <Button
      disabled={disabled || full}
      aria-describedby={full ? fullId : undefined}
      onClick={() => setAdding(true)}
    >
      <Plus aria-hidden="true" />
      {t("add")}
    </Button>
  ) : undefined;

  return (
    <PageBody
      className={pageGlowClass}
      // Where the keyboard is, outside the toast: where it goes back to.
      onFocus={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          !target.closest('[role="status"]')
        ) {
          lastFocus.current = target;
        }
      }}
    >
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? UNDO_MS : undefined}
        action={
          toast?.undo
            ? { label: tManage("undo"), onClick: toast.undo }
            : undefined
        }
        focusAction={toast?.focus === true}
        onFocusLeave={focusAfterToast}
      />
      {/* The phone's role screen has its own title in place of this one. */}
      <div className={phoneRole ? "hidden md:block" : undefined}>
        <PageHeader
          back={
            paths.place === "app"
              ? { href: paths.manage, label: t("back") }
              : { href: paths.business, label: paths.name }
          }
          title={t("title")}
          subtitle={inConsole ? tConsole("subtitle") : t("subtitle")}
          actions={addAction}
          headingRef={listHeading}
        />
      </div>
      {phoneRole ? (
        <div className="flex flex-col md:hidden">
          <button
            type="button"
            onClick={closeOnPhone}
            className="pressable -ms-1 mb-2 flex min-h-11 items-center gap-0.5 self-start rounded-full pe-3 font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-5 ltr:-scale-x-100"
            />
            {t("title")}
          </button>
          <PageHeader
            title={roleName(phoneRole)}
            subtitle={`${about(phoneRole)} · ${summary(phoneRole.access)}`}
            headingRef={phoneHeading}
          />
          {phoneRole.people.length > 0 ? (
            <div className="mt-3">{stack(phoneRole.people, "md")}</div>
          ) : null}
          <GiveOrInvited
            role={phoneRole}
            given={givenThere(phoneRole)}
            href={paths.team}
            label={giveLabel}
            className="mt-1 self-start text-base"
          />
        </div>
      ) : null}

      <p className="-mt-2 px-1 text-ink-2 md:-mt-4">
        {disabled
          ? failureWords("viewOnly")
          : anyOpen
            ? t("savesItself")
            : null}
        {closedAllId ? (
          <span id={closedAllId} className={disabled ? "block" : undefined}>
            {t("closedAll")}
          </span>
        ) : null}
        {full ? (
          <span id={fullId} className="block">
            {t.rich("failure.limit", { max: ROLE_LIMIT, ltr })}
          </span>
        ) : null}
      </p>
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failureWords(failure)}
        </p>
      ) : null}

      {/* Phone: the roles, or the one opened. */}
      <div className="md:hidden">
        <div className={phoneRole ? "hidden" : "flex flex-col gap-6"}>
          {roleList("phone")}
        </div>
        {phoneRole ? roleAreas(phoneRole, 2) : null}
      </div>

      {/* Tablet: the roles, and the chosen one beside them. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
        <div className="flex min-w-0 flex-col">{roleList("tablet")}</div>
        {role ? (
          <section
            aria-labelledby={`${id}-chosen`}
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex items-center gap-3 px-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <h2
                  ref={chosenHeading}
                  id={`${id}-chosen`}
                  tabIndex={-1}
                  className="font-bold text-lg outline-none"
                >
                  {roleName(role)}
                </h2>
                <p className="text-ink-2 text-sm">{about(role)}</p>
                <GiveOrInvited
                  role={role}
                  given={givenThere(role)}
                  href={paths.team}
                  label={giveLabel}
                  className="self-start text-sm"
                />
              </div>
              {stack(role.people, "md")}
            </div>
            {roleAreas(role, 3)}
          </section>
        ) : null}
      </div>

      {/* Desktop: every area against every role. */}
      <div className="hidden xl:flex xl:flex-col xl:gap-8">
        <div className="flex flex-col gap-3">
          {beyondNote ? (
            <VisibilityNote icon="lock" className="max-w-2xl px-1">
              {beyondNote}
            </VisibilityNote>
          ) : null}
          <RolesMatrix
            data={data}
            roles={roles}
            disabled={disabled}
            closedAllId={closedAllId}
            payHref={paths.access}
            payLink={tAccess("title")}
            teamHref={paths.team}
            giveLabel={giveLabel}
            givenThere={givenThere}
            onChange={change}
            onReset={reset}
            resetRef={resetRef}
            resettable={(target) => resettable(target).length > 0}
            changedWords={changedWords}
            resetHint={resetHint}
            onRename={actions.renameRole ? startRename : undefined}
            onArchive={actions.archiveRole ? archive : undefined}
          />
        </div>
        <PageSection title={t("fixed")}>
          <ListGroup className="max-w-2xl">
            <ListRow
              leading={<Crown />}
              title={tRoles("owner")}
              subtitle={`${people(data.owners)} · ${t("owner")}`}
              trailing={stack(data.owners)}
            />
            <ListRow
              {...payLink}
              leading={<Calculator />}
              title={tRoles("accountant")}
              subtitle={`${people(data.accountants)} · ${accountantSees}`}
              trailing={stack(data.accountants)}
            />
          </ListGroup>
          <VisibilityNote icon="lock" className="max-w-2xl px-1">
            {fixedNote}
          </VisibilityNote>
        </PageSection>
      </div>

      {actions.addRole ? (
        <Sheet
          open={adding}
          onOpenChange={setAdding}
          title={t("addSheet.title")}
          closeLabel={t("addSheet.close")}
        >
          {/* Mounted on each opening, so it starts empty. */}
          <AddRoleForm
            roles={roles}
            taken={[...roles.map(roleName), ...ROLES.map((r) => tRoles(r))]}
            onAdd={add}
            onDone={() => setAdding(false)}
          />
        </Sheet>
      ) : null}

      {actions.renameRole ? (
        <Sheet
          open={renameOpen && renaming !== null}
          onOpenChange={setRenameOpen}
          title={t("renameSheet.title")}
          closeLabel={t("addSheet.close")}
        >
          {renaming ? (
            <RenameRoleForm
              // Mounted for each role, so it starts with that one's name.
              key={renaming.key}
              role={renaming}
              taken={[
                ...roles.filter((r) => r.key !== renaming.key).map(roleName),
                ...ROLES.map((r) => tRoles(r)),
              ]}
              onRename={(name) => rename(renaming, name)}
              onDone={() => setRenameOpen(false)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </PageBody>
  );
}

/**
 * One area of a role, in a card: in a module, "עריכה" on or off with what
 * each gives, and the switches under it, off and closed while it is off; in
 * team and manage, edit, view or none, with what the chosen one means. An
 * area not open for changes yet shows the same, every control off, and says
 * so under its name, unless no area is open, which the screen says once.
 */
function AreaCard({
  area,
  role,
  headingLevel,
  disabled,
  closedAllId,
  changed,
  onChange,
}: {
  area: RolesArea;
  role: EditableRole;
  /** 2 on the phone's screen for the role, 3 under its name beside the list. */
  headingLevel: 2 | 3;
  disabled: boolean;
  /** The screen's line that no area is open yet, while none is. */
  closedAllId: string | null;
  /** It differs from where the role started (R10): marked "שונה". */
  changed: boolean;
  onChange: (next: RoleAccess) => void;
}) {
  const t = useTranslations("app.manage.roles");
  const areaName = useAreaName();
  const nameOf = useRoleName();
  const id = useId();
  const key = area.key;
  const name = areaName(key);
  const roleName = nameOf(role);
  const access = role.access;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const locked = disabled || !area.open;
  const closedId = `${id}-closed`;
  /** Why it is off while the area is closed: the screen's line, or its own. */
  const why = area.open ? null : (closedAllId ?? closedId);
  /** What a control says of itself, and why it is off while the area is closed. */
  const described = (hint: string) => (why ? `${hint} ${why}` : hint);
  return (
    <ListGroup>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        <span
          aria-hidden="true"
          className={cn(markClass, "size-10 rounded-[13px] [&_svg]:size-6")}
        >
          {areaIcon(area)}
        </span>
        <Heading className="font-semibold text-md">{name}</Heading>
        {changed ? (
          <Badge tone="accent" className="ms-auto">
            {t("changed")}
          </Badge>
        ) : null}
      </div>
      {why === closedId ? (
        <ClosedNote id={closedId} className="px-4 pb-2" />
      ) : null}
      {editOrView(key) ? (
        <>
          <FieldRow
            label={t("levels.edit")}
            hint={
              <span id={`${id}-edit`}>
                {t(`editHint.${key}`)}
                {/* Pay reads every hour, at any level of the clock (R4). */}
                {key === "time_clock" && role.seesPay ? (
                  <span className="block">{t("payHours")}</span>
                ) : null}
              </span>
            }
            // It follows the card's title, with no line between them.
            className="before:hidden"
          >
            <Switch
              checked={access.levels[key] === "edit"}
              disabled={locked}
              aria-label={t("editLabel", { area: name, role: roleName })}
              aria-describedby={described(`${id}-edit`)}
              onChange={(on) =>
                onChange(withLevel(access, key, on ? "edit" : "view"))
              }
            />
          </FieldRow>
          {extrasOf(key).map((extra) => {
            const open = extraOpen(access, extra);
            const hintId = `${id}-${extra}`;
            return (
              <FieldRow
                key={extra}
                label={t(`extras.${extra}.label`)}
                // What it does, always, and while it is closed, why.
                hint={
                  <span id={hintId}>
                    {t(`extras.${extra}.hint`)}
                    {open ? null : (
                      <span className="block">{t("needsEdit")}</span>
                    )}
                  </span>
                }
              >
                <Switch
                  checked={holdsExtra(access, extra)}
                  disabled={locked || !open}
                  aria-label={t("extraLabel", {
                    extra: t(`extras.${extra}.label`),
                    role: roleName,
                  })}
                  aria-describedby={described(hintId)}
                  onChange={(on) => onChange(withExtra(access, extra, on))}
                />
              </FieldRow>
            );
          })}
        </>
      ) : (
        <div className="flex flex-col gap-2 px-4 pt-1 pb-4">
          <PlaceLevel
            area={key}
            access={access}
            label={t("levelLabel", { area: name, role: roleName })}
            disabled={locked}
            onChange={onChange}
          />
        </div>
      )}
    </ListGroup>
  );
}

/**
 * Edit, view or none for the team screen or the management page, and what
 * the chosen one means: a Segmented in a role's card, and a menu in the
 * table's narrow cell, each level there with its meaning.
 */
function PlaceLevel({
  area,
  access,
  label,
  disabled,
  menu = false,
  mark = null,
  onChange,
}: {
  area: PlaceArea;
  access: RoleAccess;
  label: string;
  disabled: boolean;
  menu?: boolean;
  /** Beside the control, on its line: "שונה" in the table's cell (R10). */
  mark?: ReactNode;
  onChange: (next: RoleAccess) => void;
}) {
  const t = useTranslations("app.manage.roles");
  const level = access.levels[area];
  const choices = levelChoices(area);
  const choose = (choice: AccessLevel) =>
    onChange(withLevel(access, area, choice));
  let control: ReactNode;
  if (disabled) {
    control = <p className="font-medium">{t(`levels.${level}`)}</p>;
  } else if (menu) {
    control = (
      <ChoiceMenu
        label={`${label}: ${t(`levels.${level}`)}`}
        value={level}
        className="self-start text-ink"
        options={choices.map((choice) => ({
          key: choice,
          label: t(`levels.${choice}`),
          hint: t(`levelHint.${area}.${choice}`),
        }))}
        onChange={(key) => {
          const choice = choices.find((c) => c === key);
          if (choice) choose(choice);
        }}
      />
    );
  } else {
    control = (
      <Segmented
        label={label}
        value={level}
        options={choices.map((choice) => ({
          value: choice,
          label: t(`levels.${choice}`),
        }))}
        onChange={choose}
      />
    );
  }
  return (
    <>
      {mark ? (
        <div className="flex flex-wrap items-center gap-2">
          {control}
          {mark}
        </div>
      ) : (
        control
      )}
      <p className="text-ink-2 text-sm">{t(`levelHint.${area}.${level}`)}</p>
    </>
  );
}

/**
 * The desktop's full picture: a row for each area's edit, one for each switch
 * under it, one for team and one for manage, and pay at the foot (where it
 * opens something), against a column for each role, with what each row gives
 * beside its name, and, for an area not open for changes yet, that it isn't
 * (unless no area is open, which the screen says once).
 */
function RolesMatrix({
  data,
  roles,
  disabled,
  closedAllId,
  payHref,
  payLink,
  teamHref,
  giveLabel,
  givenThere,
  onChange,
  onReset,
  resetRef,
  resettable,
  changedWords,
  resetHint,
  onRename,
  onArchive,
}: {
  data: RolesData;
  roles: EditableRole[];
  disabled: boolean;
  /** The screen's line that no area is open yet, while none is. */
  closedAllId: string | null;
  payHref: string | null;
  payLink: string;
  /** The team screen, where a role nobody holds yet is given. */
  teamHref: string;
  /** What that link says, where the screen is drawn. */
  giveLabel: string;
  /** Whether `teamHref` gives the role (`givenThere`). */
  givenThere: (role: EditableRole) => boolean;
  onChange: (role: EditableRole, area: AccessArea, next: RoleAccess) => void;
  /**
   * Puts every area of a role that differs from where it started back (R10),
   * the keyboard waiting on the role's name in its column's head (`anchor`).
   */
  onReset: (role: EditableRole, anchor: HTMLElement | null) => void;
  /** Keeps a role's "חזרה להתחלה", for the keyboard to come back to. */
  resetRef: (key: string) => RefCallback<HTMLElement>;
  /** Some open area of the role differs from where it started. */
  resettable: (role: EditableRole) => boolean;
  /** How many of the role's areas say "שונה", in words; none, nothing. */
  changedWords: (role: EditableRole) => string | null;
  /** Where "חזרה להתחלה" puts the role, in words. */
  resetHint: (role: EditableRole) => string;
  /** Opens the sheet that renames a role the business named. */
  onRename?: (role: EditableRole) => void;
  /** Takes a role the business named off the list. */
  onArchive?: (role: EditableRole) => void;
}) {
  const t = useTranslations("app.manage.roles");
  const tRoles = useTranslations("app.team.roles");
  const areaName = useAreaName();
  const roleName = useRoleName();
  const payWords = usePayWords();
  const id = useId();
  const column = (role: EditableRole) => `role:${role.key}`;
  /** Each role's name in its column's head, by its role, while it is drawn. */
  const names = useRef(new Map<string, HTMLElement>());
  const nameRef =
    (key: string): RefCallback<HTMLElement> =>
    (element) => {
      if (element === null) return undefined;
      names.current.set(key, element);
      return () => {
        names.current.delete(key);
      };
    };

  const columns: DataColumn[] = [
    { key: "area", label: t("matrix.area") },
    ...roles.map((role) => {
      const changes = changedWords(role);
      return {
        key: column(role),
        label: (
          <span className="flex flex-col items-start gap-1 py-1">
            {/* Where the keyboard waits while its "חזרה להתחלה" goes. */}
            <span
              ref={nameRef(role.key)}
              tabIndex={-1}
              className="font-semibold text-base text-ink outline-none"
            >
              {roleName(role)}
            </span>
            <span className="flex items-center gap-2">
              {role.people.length > 0 ? (
                <AvatarStack people={role.people} max={3} />
              ) : null}
              {t("people", { count: role.people.length })}
            </span>
            {role.name !== null ? (
              <span>{t("builtOn", { role: tRoles(role.base) })}</span>
            ) : null}
            <GiveOrInvited
              role={role}
              given={givenThere(role)}
              href={teamHref}
              label={giveLabel}
            />
            {/* How many of its areas say "שונה", as its row in the list does. */}
            {changes ? <span>{changes}</span> : null}
            {/* Back to where it started, while some area differs (R10). */}
            {resettable(role) ? (
              <>
                <button
                  ref={resetRef(role.key)}
                  type="button"
                  className={headActionClass}
                  disabled={disabled}
                  aria-label={t("reset.label", { role: roleName(role) })}
                  aria-describedby={`${id}-${role.key}-reset`}
                  onClick={() =>
                    onReset(role, names.current.get(role.key) ?? null)
                  }
                >
                  {t("reset.action")}
                </button>
                <span id={`${id}-${role.key}-reset`} className="max-w-xs">
                  {resetHint(role)}
                </span>
              </>
            ) : null}
            {role.name !== null && (onRename || onArchive) ? (
              <span className="flex flex-wrap gap-x-4">
                {onRename ? (
                  <button
                    type="button"
                    className={headActionClass}
                    disabled={disabled}
                    aria-label={t("named.renameLabel", {
                      role: roleName(role),
                    })}
                    onClick={() => onRename(role)}
                  >
                    {t("named.rename")}
                  </button>
                ) : null}
                {onArchive ? (
                  <button
                    type="button"
                    className={cn(headActionClass, "text-danger")}
                    disabled={disabled || heldBack(role)}
                    aria-label={t("named.archiveLabel", {
                      role: roleName(role),
                    })}
                    aria-describedby={`${id}-${role.key}-remove`}
                    onClick={() => onArchive(role)}
                  >
                    {t("named.archive")}
                  </button>
                ) : null}
              </span>
            ) : null}
            {/* What removing does, or why it can't, as a role's card says. */}
            {role.name !== null && onArchive ? (
              <span id={`${id}-${role.key}-remove`} className="max-w-xs">
                {t(archiveWords(role))}
              </span>
            ) : null}
          </span>
        ),
      };
    }),
  ];

  const closedId = (key: AccessArea) => `${id}-${key}-closed`;
  /** Why a control is off while its area is closed: the screen's line, or the area's own. */
  const why = (area: RolesArea) =>
    area.open ? null : (closedAllId ?? closedId(area.key));
  /** What a control says of itself, and why it is off while its area is closed. */
  const described = (area: RolesArea, ids: string) => {
    const reason = why(area);
    return reason ? `${ids} ${reason}` : ids;
  };

  const head = (area: RolesArea, hint: string | null) => (
    <span className="flex min-w-56 max-w-sm items-start gap-3 py-1">
      <span
        aria-hidden="true"
        className={cn(markClass, "size-9 rounded-[12px] [&_svg]:size-5")}
      >
        {areaIcon(area)}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{areaName(area.key)}</span>
        {hint ? (
          <span
            id={`${id}-${area.key}`}
            className="font-normal text-ink-2 text-sm"
          >
            {hint}
          </span>
        ) : null}
        {why(area) === closedId(area.key) ? (
          <span
            id={closedId(area.key)}
            className="font-normal text-ink-2 text-sm"
          >
            {t("closed")}
          </span>
        ) : null}
      </span>
    </span>
  );

  const byRole = (cell: (role: EditableRole) => ReactNode) =>
    Object.fromEntries(roles.map((role) => [column(role), cell(role)]));

  /**
   * "שונה" in a role's cell of an area's first row, where it differs from
   * its start (R10): on the line of its switch or menu, so each control
   * stays level with the other roles' in the row.
   */
  const changedMark = (role: EditableRole, key: AccessArea) =>
    areaChanged(role.access, role.start, key) ? (
      <Badge tone="accent">{t("changed")}</Badge>
    ) : null;

  const rows: DataRow[] = data.areas.flatMap((area): DataRow[] => {
    const key = area.key;
    const name = areaName(key);
    if (!editOrView(key)) {
      return [
        {
          key,
          cells: {
            area: head(area, null),
            ...byRole((role) => (
              <div className="flex flex-col gap-1 py-1">
                <PlaceLevel
                  area={key}
                  access={role.access}
                  label={t("levelLabel", { area: name, role: roleName(role) })}
                  disabled={disabled || !area.open}
                  menu
                  mark={changedMark(role, key)}
                  onChange={(next) => onChange(role, key, next)}
                />
              </div>
            )),
          },
        },
      ];
    }
    return [
      {
        key,
        cells: {
          area: head(area, t(`editHint.${key}`)),
          ...byRole((role) => {
            const level = role.access.levels[key];
            // Pay reads every hour, at any level of the clock (R4).
            const payHours = key === "time_clock" && role.seesPay;
            const payId = `${id}-${key}-${role.key}-pay`;
            const control = (
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  checked={level === "edit"}
                  disabled={disabled || !area.open}
                  aria-label={t("editLabel", {
                    area: name,
                    role: roleName(role),
                  })}
                  aria-describedby={described(
                    area,
                    payHours ? `${id}-${key} ${payId}` : `${id}-${key}`,
                  )}
                  onChange={(on) =>
                    onChange(
                      role,
                      key,
                      withLevel(role.access, key, on ? "edit" : "view"),
                    )
                  }
                />
                <span className="text-ink-2">{t(`levels.${level}`)}</span>
                {changedMark(role, key)}
              </div>
            );
            if (!payHours) return control;
            return (
              <div className="flex flex-col gap-1 py-1">
                {control}
                {payHours ? (
                  <span id={payId} className="max-w-xs text-ink-2 text-sm">
                    {t("payHours")}
                  </span>
                ) : null}
              </div>
            );
          }),
        },
      },
      ...extrasOf(key).map((extra) => ({
        key: extra,
        cells: {
          area: (
            <span className="flex min-w-56 max-w-sm flex-col gap-0.5 py-1 ps-12">
              <span className="font-medium">{t(`extras.${extra}.label`)}</span>
              <span
                id={`${id}-${extra}`}
                className="font-normal text-ink-2 text-sm"
              >
                {t(`extras.${extra}.hint`)}
              </span>
            </span>
          ),
          ...byRole((role) => {
            const open = extraOpen(role.access, extra);
            const hintId = `${id}-${extra}`;
            // Why it is closed, said with what it does, as in a role's card.
            const needsId = `${hintId}-${role.key}-closed`;
            return (
              <div className="flex items-center gap-3">
                <Switch
                  checked={holdsExtra(role.access, extra)}
                  disabled={disabled || !area.open || !open}
                  aria-label={t("extraLabel", {
                    extra: t(`extras.${extra}.label`),
                    role: roleName(role),
                  })}
                  aria-describedby={described(
                    area,
                    open ? hintId : `${hintId} ${needsId}`,
                  )}
                  onChange={(on) =>
                    onChange(role, key, withExtra(role.access, extra, on))
                  }
                />
                {open ? null : (
                  <span id={needsId} className="text-ink-2 text-sm">
                    {t("needsEdit")}
                  </span>
                )}
              </div>
            );
          }),
        },
      })),
    ];
  });

  // Pay is given on "מי רואה שכר", where it opens something.
  if (payHref) {
    rows.push({
      key: "pay",
      cells: {
        area: (
          <span className="flex min-w-56 max-w-sm items-start gap-3 py-1">
            <span
              aria-hidden="true"
              className={cn(markClass, "size-9 rounded-[12px] [&_svg]:size-5")}
            >
              <Wallet />
            </span>
            <span className="flex flex-col items-start">
              <span className="font-semibold">{t("pay.title")}</span>
              {data.documents ? (
                <span className="font-normal text-ink-2 text-sm">
                  {t("pay.documents")}
                </span>
              ) : null}
              <Link href={payHref} className={linkClass}>
                {payLink}
              </Link>
            </span>
          </span>
        ),
        ...byRole((role) => (
          <span className="text-ink-2">
            {payWords(role, data.documents, true)}
          </span>
        )),
      },
    });
  }

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Its cells hold the switches and menus: no stop on the scroller. */}
      <DataTable
        columns={columns}
        rows={rows}
        caption={t("matrix.caption")}
        controls
      />
    </Card>
  );
}

/**
 * The new role's sheet: its name, what it is built on, and whose permissions
 * it starts with (the role it is built on, until another is chosen).
 */
function AddRoleForm({
  roles,
  taken,
  onAdd,
  onDone,
}: {
  roles: EditableRole[];
  /** The names already in use, the built-in roles' among them. */
  taken: string[];
  onAdd: (role: NewRole) => Promise<RolesFailure | null>;
  onDone: () => void;
}) {
  const t = useTranslations("app.manage.roles");
  const tRoles = useTranslations("app.team.roles");
  const roleName = useRoleName();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState<BaseRole>("worker");
  // Null while it follows what the role is built on.
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [problem, setProblem] = useState<RoleNameProblem | null>(null);
  const [failure, setFailure] = useState<RolesFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const from = copyFrom ?? base;
  const options = roles.map((role) => ({
    key: role.key,
    label: roleName(role),
  }));
  const shown = options.find((option) => option.key === from)?.label ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkRoleName(name, taken);
    if (!checked.ok) {
      setProblem(checked.problem);
      field.current?.focus();
      return;
    }
    setBusy(true);
    const failed = await onAdd({ name: checked.name, base, copyFrom: from });
    setBusy(false);
    if (failed === "taken") {
      setProblem("taken");
      field.current?.focus();
      return;
    }
    if (failed) {
      setFailure(failed);
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-5 px-2 pt-2 pb-1"
    >
      <TextField
        ref={field}
        label={t("addSheet.name")}
        value={name}
        autoComplete="off"
        maxLength={ROLE_NAME_MAX}
        hint={t("addSheet.nameHint")}
        error={
          problem
            ? t(`addSheet.problems.${problem}`, { max: ROLE_NAME_MAX })
            : undefined
        }
        onChange={(event) => {
          setName(event.target.value);
          setProblem(null);
        }}
      />
      {/* In the sheet, its groups are its own surface (bg-elevated). */}
      <ChoiceList
        legend={t("addSheet.base")}
        groupClassName="bg-elevated shadow-none"
      >
        {BASE_ROLES.map((choice) => (
          <ChoiceRow
            key={choice}
            name={`${id}-base`}
            value={choice}
            checked={base === choice}
            onChange={() => setBase(choice)}
            title={tRoles(choice)}
            // What the base decides: whose permissions it starts with, and
            // who may give it (its rank on the team).
            hint={t(`addSheet.baseHint.${choice}`, { role: tRoles(choice) })}
          />
        ))}
      </ChoiceList>
      <div className="flex flex-col gap-2">
        <ListGroup className="bg-elevated shadow-none">
          <FieldRow label={t("addSheet.copy")}>
            <ChoiceMenu
              label={`${t("addSheet.copy")}: ${shown}`}
              value={from}
              options={options}
              onChange={setCopyFrom}
            />
          </FieldRow>
        </ListGroup>
        <p className="px-1 text-ink-2 text-sm">{t("addSheet.copyHint")}</p>
      </div>
      {failure ? (
        <p role="alert" className="text-center text-base text-danger">
          {t.rich(`failure.${failure}`, { max: ROLE_LIMIT, ltr })}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="w-full">
        {t("addSheet.submit")}
      </Button>
    </form>
  );
}

/**
 * The sheet that renames a role the business named: its name, as when it was
 * added, never one another role goes by.
 */
function RenameRoleForm({
  role,
  taken,
  onRename,
  onDone,
}: {
  role: EditableRole;
  /** The other roles' names, the built-in roles' among them. */
  taken: string[];
  onRename: (name: string) => Promise<RolesFailure | null>;
  onDone: () => void;
}) {
  const t = useTranslations("app.manage.roles");
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(role.name ?? "");
  const [problem, setProblem] = useState<RoleNameProblem | null>(null);
  const [failure, setFailure] = useState<RolesFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkRoleName(name, taken);
    if (!checked.ok) {
      setProblem(checked.problem);
      field.current?.focus();
      return;
    }
    if (checked.name === role.name) {
      onDone();
      return;
    }
    setBusy(true);
    const failed = await onRename(checked.name);
    setBusy(false);
    if (failed === "taken") {
      setProblem("taken");
      field.current?.focus();
      return;
    }
    if (failed) {
      setFailure(failed);
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-5 px-2 pt-2 pb-1"
    >
      <TextField
        ref={field}
        label={t("addSheet.name")}
        value={name}
        autoComplete="off"
        maxLength={ROLE_NAME_MAX}
        error={
          problem
            ? t(`addSheet.problems.${problem}`, { max: ROLE_NAME_MAX })
            : undefined
        }
        onChange={(event) => {
          setName(event.target.value);
          setProblem(null);
        }}
      />
      {failure ? (
        <p role="alert" className="text-center text-base text-danger">
          {t.rich(`failure.${failure}`, { max: ROLE_LIMIT, ltr })}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="w-full">
        {t("renameSheet.submit")}
      </Button>
    </form>
  );
}
