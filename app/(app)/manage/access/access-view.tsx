"use client";

import {
  canGetPersonalPay,
  coveredByRole,
  hasPayRoleStaff,
  namedRolesBesidePay,
  overPayHoldersWarning,
  PAY_ROLES,
  type PayRole,
  payHolderCount,
} from "@domain/payroll-access";
import { namedRoleName } from "@domain/role-access";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldRow } from "@ui/field-row";
import {
  type FocusCandidate,
  firstOnScreen,
  inViewWhenFocused,
} from "@ui/focus-after";
import { onLeavingBusiness } from "@ui/leaving-business";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { UndoRow } from "@ui/undo-row";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { NoteView } from "../../clock/pay/note-view";
import type { NotePayView } from "../../clock/pay/pay-types";
import { type HeldTimer, heldTimer } from "../../held-timer";
import type {
  AccessActions,
  AccessData,
  AccessFailure,
  AccessPaths,
  AccessPersonRow,
} from "./access-types";
import { accessRemove, createUndoSlot } from "./access-undo";

/** How long the way back stays, before a removal is written. */
const UNDO_MS = 6000;

/**
 * A way back. `key` is what it undoes (a role's switch as it turned, a
 * person), so another while it is up is a row of its own (UndoRow's `key`).
 * `after` is where the focus goes when the row goes while it holds it
 * (undone, or its time up), the page's title after them.
 */
type Undo = {
  key: string;
  message: string;
  run: () => void;
  after: () => readonly FocusCandidate[];
};

/**
 * One way back, shown for six seconds under what it undoes, waiting while
 * it is being reached (`createUndoSlot`).
 */
function useUndoSlot() {
  const [shown, setShown] = useState<Undo | null>(null);
  const [slot] = useState(() => createUndoSlot<Undo>(UNDO_MS, setShown));
  return { shown, show: slot.show, clear: slot.clear, waits: slot.waits };
}

/**
 * Who sees pay, for the owner: owners and accountants always; managers and
 * workers by a switch that saves at once and offers its undo under the
 * switches; and people given access personally, each removed with an undo
 * under their list that holds the removal for six seconds before it is
 * written (so nobody is told twice), and added from the staff without it. A
 * held removal is written early when the page is hidden or closed, the
 * screen is left, or the person switches business, and its undo goes with
 * it. Each write names the business the screen was drawn for, and the
 * server refuses it in any other. How many see pay is said under
 * the roles, with the warning past ten. Phone: one column. Tablet and desktop:
 * the roles at the start, the personal access at the end. The same screen is
 * the ConceptApp team's in the console (`paths.place`), with its own actions,
 * its way back to the business and its own words for what a team role can't
 * do; it notes no view there (`noted`). There a business may have nobody in
 * it yet, and the screen says nobody sees pay and that whoever joins shows
 * up, and someone on the team who is also in the business can't take away
 * their own access. Someone in a role the business named goes by its name,
 * with the role it is built on, and sees pay only by their own access, even
 * where that role sees it (the roles plan's R11e): they are offered here,
 * and while anyone offered is in one on a role that sees pay, a line under
 * the switches names it, the switch it isn't under, and where to give them
 * access, said as it appears (a switch turned on, a removal). A person's
 * "הסרה" goes with their row, so the undo's "ביטול" takes the focus as it
 * appears; each way back, and the removal it holds, waits while it is being
 * reached (accessibility, part 8). Undone, the focus goes back to the
 * person's "הסרה", or the role's switch; its time up, to the title of its
 * section.
 */
export function AccessView({
  data,
  actions,
  paths,
  noted,
}: {
  data: AccessData;
  actions: AccessActions;
  paths: AccessPaths;
  /**
   * Notes that the owner opened it (`payroll.view`), with the business's
   * month today; null in the console, where the team holds no pay access.
   */
  noted: { month: string; note: NotePayView } | null;
}) {
  const t = useTranslations("app.manage.access");
  const tConsole = useTranslations("admin.access");
  const tRoles = useTranslations("app.team.roles");
  const tTeam = useTranslations("app.team");
  const locale = useLocale();
  const id = useId();
  // What the screen shows is its own from here: each change shows at once.
  const [roles, setRoles] = useState<PayRole[]>(data.roles);
  const [people, setPeople] = useState<AccessPersonRow[]>(data.people);
  const roleUndo = useUndoSlot();
  const personUndo = useUndoSlot();
  const [failure, setFailure] = useState<AccessFailure | null>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  // A removal waiting for its six seconds: written then, or sooner when the
  // page is hidden or the screen goes. Its wait stops while its "ביטול" is
  // being reached. `holding` is the same, for the effect that listens while
  // one waits.
  const pending = useRef<{ person: string; wait: HeldTimer } | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  // Each section's title, where the focus goes once its way back has gone.
  const rolesTitle = useRef<HTMLHeadingElement>(null);
  const personalTitle = useRef<HTMLHeadingElement>(null);

  const nameOf = (person: AccessPersonRow) => person.name ?? t("noName");
  const disabled = data.viewOnly;
  /**
   * What went wrong, said to whoever reads it: in the console, what a team
   * role can't do, and someone no longer in the business (not "the team");
   * what only the console's actions say, in its words wherever it comes.
   */
  const failureWords = (failure: AccessFailure) => {
    if (failure === "notInUse" || failure === "self") {
      return tConsole(`failure.${failure}`);
    }
    return paths.place === "console" &&
      (failure === "noAccess" ||
        failure === "viewOnly" ||
        failure === "notInTeam")
      ? tConsole(`failure.${failure}`)
      : t(`failure.${failure}`);
  };
  /**
   * Why nobody is offered: nobody pay access is given to (no managers or
   * workers yet, as in a business the team has just set up), or all of them
   * see it already, "the business" in the console, where "the team" is
   * ConceptApp's.
   */
  const nobodyWords = () => {
    if (!hasPayRoleStaff(people)) return t("personal.noStaff");
    return paths.place === "console"
      ? tConsole("nobody")
      : t("personal.nobody");
  };
  /**
   * Their role sees pay anyway, with or without their own access: never a
   * role the business named (`coveredByRole`).
   */
  const roleCovers = (person: AccessPersonRow) => coveredByRole(person, roles);
  /**
   * Their role as the team's screens name it (the roles plan's R11b): a
   * role the business named by its name, with the role it is built on.
   */
  const roleOf = (person: AccessPersonRow) =>
    person.namedRole
      ? tTeam("namedRole", {
          name: namedRoleName(person.namedRole, locale),
          role: tRoles(person.role),
        })
      : tRoles(person.role);

  function say(text: string) {
    setToast({ text, stamp: new Date().toISOString() });
  }

  function markPersonal(personId: string, personal: boolean) {
    setPeople((all) =>
      all.map((p) => (p.userId === personId ? { ...p, personal } : p)),
    );
  }

  async function run(
    write: () => Promise<{ ok: true } | { ok: false; failure: AccessFailure }>,
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

  function setRole(role: PayRole, granted: boolean) {
    const before = roles;
    const after = granted
      ? [...roles.filter((r) => r !== role), role]
      : roles.filter((r) => r !== role);
    setRoles(after);
    void run(
      () => actions.setRole(role, granted),
      () => setRoles(before),
    ).then((done) => {
      if (!done) return;
      roleUndo.show({
        key: `${role}:${granted ? "on" : "off"}`,
        message: t(granted ? "done.roleOn" : "done.roleOff", { role }),
        run: () => {
          roleUndo.clear();
          setRoles(before);
          void run(
            () => actions.setRole(role, !granted),
            () => setRoles(after),
          ).then((back) => {
            if (back) say(t("done.undone"));
          });
        },
        // The switch stays where it was: back on it, else the section.
        after: () => [
          document.getElementById(`${id}-${role}`),
          rolesTitle.current,
        ],
      });
    });
  }

  /** Lets go of a held removal without writing it: they never lost access. */
  function releasePending() {
    const held = pending.current;
    if (!held) return null;
    held.wait.clear();
    pending.current = null;
    setHolding(null);
    return held.person;
  }

  /**
   * Writes a removal held for its undo, now, and returns the write (none when
   * nothing is held). Its undo goes with it.
   */
  function commitPending(): Promise<boolean> | null {
    const person = releasePending();
    if (person === null) return null;
    personUndo.clear();
    return run(
      () => actions.setPerson(person, false),
      () => markPersonal(person, true),
    );
  }

  function undoRemoval(person: AccessPersonRow) {
    personUndo.clear();
    markPersonal(person.userId, true);
    if (pending.current?.person === person.userId) {
      releasePending();
      return;
    }
    // The removal was written already: giving it back is a grant of its own.
    void run(
      () => actions.setPerson(person.userId, true),
      () => markPersonal(person.userId, false),
    ).then((back) => {
      if (back) say(t("done.undone"));
    });
  }

  function remove(person: AccessPersonRow) {
    // One removal waits at a time: an earlier one is written now.
    void commitPending();
    markPersonal(person.userId, false);
    pending.current = {
      person: person.userId,
      wait: heldTimer(UNDO_MS, () => void commitPending()),
    };
    setHolding(person.userId);
    personUndo.show({
      key: person.userId,
      message: roleCovers(person)
        ? t("done.removedRoleCovers", {
            name: nameOf(person),
            role: person.role,
          })
        : t("done.removed", { name: nameOf(person) }),
      run: () => undoRemoval(person),
      // Back in the list: their "הסרה", maybe far above, brought into view
      // as it takes the focus. Written, they are gone: the section's title.
      after: () => [
        inViewWhenFocused(firstOnScreen([accessRemove(person.userId)])),
        personalTitle.current,
      ],
    });
  }

  /**
   * The "ביטול" of a removed person is being reached, or no longer: the row
   * and the removal it holds wait as long. A row going as the next person is
   * removed changes nothing of the next one's.
   */
  function personWaits(personId: string, waiting: boolean) {
    personUndo.waits(personId, waiting);
    const held = pending.current;
    if (held?.person !== personId) return;
    if (waiting) held.wait.pause();
    else held.wait.resume();
  }

  function add(personId: string) {
    const person = people.find((p) => p.userId === personId);
    if (!person) return;
    if (pending.current?.person === personId) {
      // Their removal is still held, so the database still gives them
      // access: the same as pressing ביטול.
      releasePending();
      personUndo.clear();
      markPersonal(personId, true);
      say(t("done.added", { name: nameOf(person) }));
      return;
    }
    void commitPending();
    markPersonal(personId, true);
    void run(
      () => actions.setPerson(personId, true),
      () => markPersonal(personId, false),
    ).then((done) => {
      if (done) say(t("done.added", { name: nameOf(person) }));
    });
  }

  // While a removal is held, a hidden or closing page writes it now: a phone
  // may never run the screen's timer again, and a closed tab never will. So
  // does a switch to another business (payroll P3b), which waits for the
  // write, so it runs in this business and not in the next.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens while one is held
  useEffect(() => {
    if (holding === null) return;
    const now = () => void commitPending();
    const hidden = () => {
      if (document.visibilityState === "hidden") now();
    };
    window.addEventListener("pagehide", now);
    document.addEventListener("visibilitychange", hidden);
    const stopLeaving = onLeavingBusiness(commitPending);
    return () => {
      window.removeEventListener("pagehide", now);
      document.removeEventListener("visibilitychange", hidden);
      stopLeaving();
    };
  }, [holding]);

  // Leaving the screen writes what was waiting for its undo. Next keeps the
  // screen (cacheComponents hides it in an <Activity>) and shows it again as
  // it was, so both ways back go too: none comes back that can't undo. A
  // layout effect, so the way back never flashes an undo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(
    () => () => {
      void commitPending();
      roleUndo.clear();
      personUndo.clear();
    },
    [],
  );

  const roleShown = roleUndo.shown;
  const personShown = personUndo.shown;
  const count = payHolderCount(people, roles);
  const personal = people.filter((p) => p.personal);
  const candidates = people.filter((p) => canGetPersonalPay(p, roles, data.me));
  const canAdd = !disabled && candidates.length > 0;
  // Someone offered who is in a role the business named, on a role that sees
  // pay: that role's switch isn't theirs, and the lines under it say so, a
  // line for each such role, while one of its people still waits for access.
  const besidePay = namedRolesBesidePay(candidates, roles);

  const fixed = (key: "owner" | "accountant") => (
    <ListRow
      title={t(`roles.${key}`)}
      trailing={<span className="text-ink-2">{t("always")}</span>}
    />
  );

  return (
    <PageBody className={pageGlowClass}>
      {noted ? (
        <NoteView month={noted.month} kind="access" note={noted.note} />
      ) : null}
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <PageHeader
        back={
          paths.place === "app"
            ? { href: paths.manage, label: t("back") }
            : { href: paths.business, label: paths.name }
        }
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failureWords(failure)}
        </p>
      ) : null}
      {disabled ? (
        <p className="px-1 text-ink-2">{failureWords("viewOnly")}</p>
      ) : null}

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
        <PageSection title={t("groups.roles")} headingRef={rolesTitle}>
          <ListGroup>
            {fixed("owner")}
            {fixed("accountant")}
            {PAY_ROLES.map((role) => (
              <FieldRow
                key={role}
                label={t(`roles.${role}`)}
                htmlFor={`${id}-${role}`}
              >
                <Switch
                  id={`${id}-${role}`}
                  checked={roles.includes(role)}
                  disabled={disabled}
                  onChange={(on) => setRole(role, on)}
                />
              </FieldRow>
            ))}
          </ListGroup>
          {roleShown ? (
            <UndoRow
              key={roleShown.key}
              message={roleShown.message}
              onUndo={roleShown.run}
              // The switch keeps the focus; reached, the row waits.
              onWaitingChange={(waiting) =>
                roleUndo.waits(roleShown.key, waiting)
              }
              focusAfter={roleShown.after}
            />
          ) : null}
          <p className="px-1 text-ink-2">{t("count", { count })}</p>
          {/* Always there, so what appears in it is said: the switch just
              turned on isn't theirs. Empty, it is out of the flow but still
              read (not display: none, which a reader would miss). */}
          <div
            aria-live="polite"
            className="flex flex-col gap-1 px-1 text-ink-2 empty:sr-only"
          >
            {besidePay.map(({ namedRole, base }) => (
              <p key={namedRole.id}>
                {t("namedRoles", {
                  role: namedRoleName(namedRole, locale),
                  base,
                })}
              </p>
            ))}
            {besidePay.length > 0 && canAdd ? (
              <p>{t("namedRolesAdd", { add: t("personal.add") })}</p>
            ) : null}
          </div>
          {/* The office reads the documents people send (chat C7): the same people. */}
          {data.documents ? (
            <div className="flex flex-col gap-1 px-1 text-ink-2">
              <p>{t("documents")}</p>
              <p>{t("documentsCount", { count })}</p>
            </div>
          ) : null}
          {overPayHoldersWarning(count) ? (
            <p className="flex items-start gap-2 px-1 font-medium text-warning">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              {t("overTen")}
            </p>
          ) : null}
        </PageSection>

        <PageSection title={t("groups.personal")} headingRef={personalTitle}>
          {personal.length > 0 ? (
            <ListGroup>
              {personal.map((person) => (
                <ListRow
                  key={person.userId}
                  leading={
                    <PersonAvatar name={person.name} photo={person.photo} />
                  }
                  title={nameOf(person)}
                  subtitle={
                    roleCovers(person)
                      ? `${roleOf(person)} · ${t("personal.roleCovers")}`
                      : roleOf(person)
                  }
                  trailing={
                    // Nobody changes their own (the database refuses it): in
                    // the console, someone on the team who is also in the
                    // business, given access by its owner.
                    person.userId === data.me ? (
                      <span className="text-ink-2">{t("personal.self")}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        // The word it shows, then whose access it takes away.
                        aria-label={t("personal.removeLabel", {
                          remove: t("personal.remove"),
                          name: nameOf(person),
                        })}
                        // Found again by its person once "ביטול" brings
                        // them back (`accessRemove`).
                        data-access-remove={person.userId}
                        onClick={() => remove(person)}
                      >
                        {t("personal.remove")}
                      </Button>
                    )
                  }
                />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <p className="text-ink-2">
                {canAdd ? t("personal.empty") : t("personal.none")}
              </p>
            </Card>
          )}
          {personShown ? (
            <UndoRow
              // Each person removed a row of its own, which takes the focus.
              key={personShown.key}
              message={personShown.message}
              onUndo={personShown.run}
              // "הסרה" went with the person's row.
              autoFocus
              onWaitingChange={(waiting) =>
                personWaits(personShown.key, waiting)
              }
              focusAfter={personShown.after}
            />
          ) : null}
          {canAdd ? (
            <ListGroup>
              <FieldRow label={t("personal.add")}>
                <ChoiceMenu
                  // Field, then what the button shows, as every menu reads.
                  // The words beside it come in as a placeholder, so they
                  // stay the name's first words in any business's wording.
                  label={`${t("personal.addLabel", { add: t("personal.add") })}: ${t("personal.choose")}`}
                  value=""
                  placeholder={t("personal.choose")}
                  options={candidates.map((person) => ({
                    key: person.userId,
                    label: `${nameOf(person)} · ${roleOf(person)}`,
                  }))}
                  onChange={add}
                />
              </FieldRow>
            </ListGroup>
          ) : candidates.length === 0 ? (
            <p className="px-1 text-ink-2 text-sm">{nobodyWords()}</p>
          ) : null}
        </PageSection>
      </div>
    </PageBody>
  );
}
