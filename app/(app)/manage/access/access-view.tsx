"use client";

import {
  canGetPersonalPay,
  overPayHoldersWarning,
  PAY_ROLES,
  type PayRole,
  payHolderCount,
} from "@domain/payroll-access";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldRow } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { NoteView } from "../../clock/pay/note-view";
import type { NotePayView } from "../../clock/pay/pay-types";
import { UndoRow } from "../undo-row";
import type {
  AccessActions,
  AccessData,
  AccessFailure,
  AccessPaths,
  AccessPersonRow,
} from "./access-types";

/** How long the way back stays, before a removal is written. */
const UNDO_MS = 6000;

type Undo = { message: string; run: () => void };

/** One way back, shown for six seconds under what it undoes. */
function useUndoSlot() {
  const [shown, setShown] = useState<Undo | null>(null);
  const timer = useRef<number | null>(null);
  function clear() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setShown(null);
  }
  function show(next: Undo) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setShown(next);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setShown((now) => (now === next ? null : now));
    }, UNDO_MS);
  }
  return { shown, show, clear };
}

/**
 * Who sees pay, for the owner: owners and accountants always; managers and
 * workers by a switch that saves at once and offers its undo under the
 * switches; and people given access personally, each removed with an undo
 * under their list that holds the removal for six seconds before it is
 * written (so nobody is told twice), and added from the staff without it. A
 * held removal is written early when the page is hidden or closed, or the
 * screen is left, and its undo goes with it. How many see pay is said under
 * the roles, with the warning past ten. Phone: one column. Tablet and desktop:
 * the roles at the start, the personal access at the end.
 */
export function AccessView({
  data,
  actions,
  paths,
  month,
  note,
}: {
  data: AccessData;
  actions: AccessActions;
  paths: AccessPaths;
  /** The business's month today, for the view's note. */
  month: string;
  note: NotePayView;
}) {
  const t = useTranslations("app.manage.access");
  const tRoles = useTranslations("app.team.roles");
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
  // page is hidden or the screen goes. `holding` is the same, for the effect
  // that listens while one waits.
  const pending = useRef<{ person: string; timer: number } | null>(null);
  const [holding, setHolding] = useState<string | null>(null);

  const nameOf = (person: AccessPersonRow) => person.name ?? t("noName");
  const disabled = data.viewOnly;
  /** Their role sees pay anyway, with or without their own access. */
  const roleCovers = (person: AccessPersonRow) =>
    roles.some((role) => role === person.role);

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
      });
    });
  }

  /** Lets go of a held removal without writing it: they never lost access. */
  function releasePending() {
    const held = pending.current;
    if (!held) return null;
    window.clearTimeout(held.timer);
    pending.current = null;
    setHolding(null);
    return held.person;
  }

  /** Writes a removal held for its undo, now. Its undo goes with it. */
  function commitPending() {
    const person = releasePending();
    if (person === null) return;
    personUndo.clear();
    void run(
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
    commitPending();
    markPersonal(person.userId, false);
    pending.current = {
      person: person.userId,
      timer: window.setTimeout(commitPending, UNDO_MS),
    };
    setHolding(person.userId);
    personUndo.show({
      message: roleCovers(person)
        ? t("done.removedRoleCovers", {
            name: nameOf(person),
            role: person.role,
          })
        : t("done.removed", { name: nameOf(person) }),
      run: () => undoRemoval(person),
    });
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
    commitPending();
    markPersonal(personId, true);
    void run(
      () => actions.setPerson(personId, true),
      () => markPersonal(personId, false),
    ).then((done) => {
      if (done) say(t("done.added", { name: nameOf(person) }));
    });
  }

  // While a removal is held, a hidden or closing page writes it now: a phone
  // may never run the screen's timer again, and a closed tab never will.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens while one is held
  useEffect(() => {
    if (holding === null) return;
    const hidden = () => {
      if (document.visibilityState === "hidden") commitPending();
    };
    window.addEventListener("pagehide", commitPending);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", commitPending);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [holding]);

  // Leaving the screen writes what was waiting for its undo. Next keeps the
  // screen (cacheComponents hides it in an <Activity>) and shows it again as
  // it was, so both ways back go too: none comes back that can't undo. A
  // layout effect, so the way back never flashes an undo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(
    () => () => {
      commitPending();
      roleUndo.clear();
      personUndo.clear();
    },
    [],
  );

  const count = payHolderCount(people, roles);
  const personal = people.filter((p) => p.personal);
  const candidates = people.filter((p) => canGetPersonalPay(p, roles, data.me));
  const canAdd = !disabled && candidates.length > 0;

  const fixed = (key: "owner" | "accountant") => (
    <ListRow
      title={t(`roles.${key}`)}
      trailing={<span className="text-ink-2">{t("always")}</span>}
    />
  );

  return (
    <PageBody className={pageGlowClass}>
      <NoteView month={month} kind="access" note={note} />
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <PageHeader
        back={{ href: paths.manage, label: t("back") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      {disabled ? (
        <p className="px-1 text-ink-2">{t("failure.viewOnly")}</p>
      ) : null}

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
        <PageSection title={t("groups.roles")}>
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
          {roleUndo.shown ? (
            <UndoRow
              message={roleUndo.shown.message}
              onUndo={roleUndo.shown.run}
            />
          ) : null}
          <p className="px-1 text-ink-2">{t("count", { count })}</p>
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

        <PageSection title={t("groups.personal")}>
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
                      ? `${tRoles(person.role)} · ${t("personal.roleCovers")}`
                      : tRoles(person.role)
                  }
                  trailing={
                    <Button
                      variant="secondary"
                      disabled={disabled}
                      aria-label={t("personal.removeLabel", {
                        name: nameOf(person),
                      })}
                      title={t("personal.removeLabel", {
                        name: nameOf(person),
                      })}
                      onClick={() => remove(person)}
                    >
                      {t("personal.remove")}
                    </Button>
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
          {personUndo.shown ? (
            <UndoRow
              message={personUndo.shown.message}
              onUndo={personUndo.shown.run}
            />
          ) : null}
          {canAdd ? (
            <ListGroup>
              <FieldRow label={t("personal.add")}>
                <ChoiceMenu
                  label={t("personal.addLabel")}
                  value=""
                  placeholder={t("personal.choose")}
                  options={candidates.map((person) => ({
                    key: person.userId,
                    label: `${nameOf(person)} · ${tRoles(person.role)}`,
                  }))}
                  onChange={add}
                />
              </FieldRow>
            </ListGroup>
          ) : candidates.length === 0 ? (
            <p className="px-1 text-ink-2 text-sm">{t("personal.nobody")}</p>
          ) : null}
        </PageSection>
      </div>
    </PageBody>
  );
}
