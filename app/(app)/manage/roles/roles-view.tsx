"use client";

import { ROLES } from "@domain/modules";
import {
  type AccessArea,
  type AccessExtra,
  type AccessLevel,
  areaAccess,
  BASE_ROLES,
  type BaseRole,
  checkRoleName,
  defaultAccess,
  editedAreas,
  editOrView,
  extraOpen,
  extrasOf,
  extrasTurned,
  holdsExtra,
  levelChoices,
  type PlaceArea,
  ROLE_NAME_MAX,
  type RoleAccess,
  type RoleNameProblem,
  withAreaAccess,
  withExtra,
  withLevel,
} from "@domain/role-access";
import { AvatarStack } from "@ui/avatar";
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
  Plus,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
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

type Toast = { text: string; stamp: string; undo: (() => void) | null };

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

/** A role's name: the business's own, or the app's word for a manager or a worker. */
function useRoleName() {
  const tRoles = useTranslations("app.team.roles");
  return (role: EditableRole) => role.name ?? tRoles(role.base);
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

/** For a role nobody holds yet: where it is given, on the team screen. */
function GiveRole({ href, className }: { href: string; className?: string }) {
  const t = useTranslations("app.manage.roles");
  return (
    <Link href={href} className={cn(linkClass, className)}>
      {t("emptyRole")}
    </Link>
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
 * another role's permissions, and a role nobody holds yet leads to the team
 * screen, where it is given. Phone: the roles, then one role on a screen of
 * its own, a step in the history (`?role=`); tablet: the roles beside the
 * chosen one; desktop: every area against every role in one table, team and
 * manage as a menu in each narrow cell. Over mock data on
 * /design/shell/manage/roles until the database holds the choices (R1 on).
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
  const [failure, setFailure] = useState<RolesFailure | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toasts = useRef(0);
  const phoneHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
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
  const chosenRole = roles.find((r) => r.key === chosen) ?? null;
  // A role taken back (the undo of adding it) leaves the first one chosen.
  const role = chosenRole ?? roles[0] ?? null;
  const phoneRole = phoneOpen ? chosenRole : null;
  const areas = data.areas.map((area) => area.key);

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

  /**
   * As the toast's button goes with the focus (its undo pressed, or its time
   * up): back to where the keyboard was, while it is still there to take it,
   * else to the title shown.
   */
  function focusAfterToast() {
    const can = (element: HTMLElement | null) =>
      element?.isConnected &&
      element.getClientRects().length > 0 &&
      !element.matches(":disabled")
        ? element
        : null;
    const target =
      can(lastFocus.current) ??
      can(phoneHeading.current) ??
      can(listHeading.current);
    target?.focus();
  }

  function say(text: string, undo: (() => void) | null = null) {
    toasts.current += 1;
    setToast({ text, stamp: String(toasts.current), undo });
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
    if (next === before) return;
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

  /** Adds a role, or says why not, for the sheet to show. */
  async function add(input: NewRole): Promise<RolesFailure | null> {
    let result: Awaited<ReturnType<RolesActions["addRole"]>>;
    try {
      result = await actions.addRole(input);
    } catch {
      return "failed";
    }
    if (!result.ok) return result.failure;
    const from = roles.find((r) => r.key === input.copyFrom);
    const added: EditableRole = {
      key: result.key,
      base: input.base,
      name: input.name,
      people: [],
      access: from ? from.access : defaultAccess(input.base),
      // Pay is the owner's switch on its own screen, never copied.
      seesPay: false,
    };
    setRoles((all) => [...all, added]);
    setChosen(added.key);
    setFailure(null);
    say(t("done.added", { name: input.name }), () => takeBack(added));
    return null;
  }

  /** The undo of adding a role: nobody holds it yet. */
  function takeBack(added: EditableRole) {
    const name = added.name ?? "";
    setRoles((all) => all.filter((r) => r.key !== added.key));
    void run(
      () => actions.removeRole(added.key),
      () => setRoles((all) => [...all, added]),
    ).then((done) => {
      if (done) say(t("done.addUndone", { name }));
    });
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

  const stack = (list: readonly RolePerson[], size: "sm" | "md" = "sm") =>
    list.length > 0 ? <AvatarStack people={list} size={size} max={3} /> : null;

  // Whoever sees pay is in the office, which reads every document of the
  // business while documents are on (private.in_office): the accountants too.
  const accountantSees = t(
    data.documents ? "accountantDocuments" : "accountant",
  );
  const fixedNote = t(data.documents ? "fixedNoteDocuments" : "fixedNote");

  /**
   * The roles, in rank order, the fixed ones at either end. Each says how
   * many hold it in words; their faces show where there is room for them
   * (beside the chosen role, and in the table's heads).
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
          {roles.map((r) => (
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
              subtitle={`${about(r)} · ${summary(r.access)}`}
            />
          ))}
          <ListRow
            href={paths.access}
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
    return (
      <div className="flex flex-col gap-4">
        {data.areas.map((area) => (
          <AreaCard
            key={area.key}
            area={area}
            role={target}
            headingLevel={headingLevel}
            disabled={disabled}
            onChange={(next) => change(target, area.key, next)}
          />
        ))}
        <ListGroup>
          <ListRow
            href={paths.access}
            leading={<Wallet />}
            title={t("pay.title")}
            subtitle={payWords(target, data.documents)}
          />
        </ListGroup>
      </div>
    );
  }

  const addAction = (
    <Button disabled={disabled} onClick={() => setAdding(true)}>
      <Plus aria-hidden="true" />
      {t("add")}
    </Button>
  );

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
        onFocusLeave={focusAfterToast}
      />
      {/* The phone's role screen has its own title in place of this one. */}
      <div className={phoneRole ? "hidden md:block" : undefined}>
        <PageHeader
          back={{ href: paths.manage, label: t("back") }}
          title={t("title")}
          subtitle={t("subtitle")}
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
          ) : (
            <GiveRole href={paths.team} className="mt-1 self-start text-base" />
          )}
        </div>
      ) : null}

      <p className="-mt-2 px-1 text-ink-2 md:-mt-4">
        {disabled ? t("failure.viewOnly") : t("savesItself")}
      </p>
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
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
                <h2 id={`${id}-chosen`} className="font-bold text-lg">
                  {roleName(role)}
                </h2>
                <p className="text-ink-2 text-sm">{about(role)}</p>
                {role.people.length === 0 ? (
                  <GiveRole href={paths.team} className="self-start text-sm" />
                ) : null}
              </div>
              {stack(role.people, "md")}
            </div>
            {roleAreas(role, 3)}
          </section>
        ) : null}
      </div>

      {/* Desktop: every area against every role. */}
      <div className="hidden xl:flex xl:flex-col xl:gap-8">
        <RolesMatrix
          data={data}
          roles={roles}
          disabled={disabled}
          payHref={paths.access}
          payLink={tAccess("title")}
          teamHref={paths.team}
          onChange={change}
        />
        <PageSection title={t("fixed")}>
          <ListGroup className="max-w-2xl">
            <ListRow
              leading={<Crown />}
              title={tRoles("owner")}
              subtitle={`${people(data.owners)} · ${t("owner")}`}
              trailing={stack(data.owners)}
            />
            <ListRow
              href={paths.access}
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
    </PageBody>
  );
}

/**
 * One area of a role, in a card: in a module, "עריכה" on or off with what
 * each gives, and the switches under it, off and closed while it is off; in
 * team and manage, edit, view or none, with what the chosen one means.
 */
function AreaCard({
  area,
  role,
  headingLevel,
  disabled,
  onChange,
}: {
  area: RolesArea;
  role: EditableRole;
  /** 2 on the phone's screen for the role, 3 under its name beside the list. */
  headingLevel: 2 | 3;
  disabled: boolean;
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
      </div>
      {editOrView(key) ? (
        <>
          <FieldRow
            label={t("levels.edit")}
            hint={<span id={`${id}-edit`}>{t(`editHint.${key}`)}</span>}
            // It follows the card's title, with no line between them.
            className="before:hidden"
          >
            <Switch
              checked={access.levels[key] === "edit"}
              disabled={disabled}
              aria-label={t("editLabel", { area: name, role: roleName })}
              aria-describedby={`${id}-edit`}
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
                  disabled={disabled || !open}
                  aria-label={t("extraLabel", {
                    extra: t(`extras.${extra}.label`),
                    role: roleName,
                  })}
                  aria-describedby={hintId}
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
            disabled={disabled}
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
  onChange,
}: {
  area: PlaceArea;
  access: RoleAccess;
  label: string;
  disabled: boolean;
  menu?: boolean;
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
      {control}
      <p className="text-ink-2 text-sm">{t(`levelHint.${area}.${level}`)}</p>
    </>
  );
}

/**
 * The desktop's full picture: a row for each area's edit, one for each switch
 * under it, one for team and one for manage, and pay at the foot, against a
 * column for each role, with what each row gives beside its name.
 */
function RolesMatrix({
  data,
  roles,
  disabled,
  payHref,
  payLink,
  teamHref,
  onChange,
}: {
  data: RolesData;
  roles: EditableRole[];
  disabled: boolean;
  payHref: string;
  payLink: string;
  /** The team screen, where a role nobody holds yet is given. */
  teamHref: string;
  onChange: (role: EditableRole, area: AccessArea, next: RoleAccess) => void;
}) {
  const t = useTranslations("app.manage.roles");
  const tRoles = useTranslations("app.team.roles");
  const areaName = useAreaName();
  const roleName = useRoleName();
  const payWords = usePayWords();
  const id = useId();
  const column = (role: EditableRole) => `role:${role.key}`;

  const columns: DataColumn[] = [
    { key: "area", label: t("matrix.area") },
    ...roles.map((role) => ({
      key: column(role),
      label: (
        <span className="flex flex-col items-start gap-1 py-1">
          <span className="font-semibold text-base text-ink">
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
          {role.people.length === 0 ? <GiveRole href={teamHref} /> : null}
        </span>
      ),
    })),
  ];

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
      </span>
    </span>
  );

  const byRole = (cell: (role: EditableRole) => ReactNode) =>
    Object.fromEntries(roles.map((role) => [column(role), cell(role)]));

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
                  disabled={disabled}
                  menu
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
            return (
              <div className="flex items-center gap-3">
                <Switch
                  checked={level === "edit"}
                  disabled={disabled}
                  aria-label={t("editLabel", {
                    area: name,
                    role: roleName(role),
                  })}
                  aria-describedby={`${id}-${key}`}
                  onChange={(on) =>
                    onChange(
                      role,
                      key,
                      withLevel(role.access, key, on ? "edit" : "view"),
                    )
                  }
                />
                <span className="text-ink-2">{t(`levels.${level}`)}</span>
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
            const closedId = `${hintId}-${role.key}-closed`;
            return (
              <div className="flex items-center gap-3">
                <Switch
                  checked={holdsExtra(role.access, extra)}
                  disabled={disabled || !open}
                  aria-label={t("extraLabel", {
                    extra: t(`extras.${extra}.label`),
                    role: roleName(role),
                  })}
                  aria-describedby={open ? hintId : `${hintId} ${closedId}`}
                  onChange={(on) =>
                    onChange(role, key, withExtra(role.access, extra, on))
                  }
                />
                {open ? null : (
                  <span id={closedId} className="text-ink-2 text-sm">
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
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="w-full">
        {t("addSheet.submit")}
      </Button>
    </form>
  );
}
