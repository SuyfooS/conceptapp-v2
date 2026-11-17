"use client";

import { parseTeamName, TEAM_NAME_MAX } from "@domain/team";
import { Button } from "@ui/button";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { useTranslations } from "next-intl";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import { HOLD_MS } from "../../use-held-write";
import type {
  MemberChangeActions,
  MemberNameResult,
  TeamChangeActionFailure,
} from "../team-change-types";
import { MemberRoleNotes, MemberRoleRow } from "./member-changes";

type Undo = { message: string; run: () => void };

type NameValue = {
  /** The name as the screen shows it now; null: none. */
  shown: string | null;
  busy: boolean;
  failure: TeamChangeActionFailure | null;
  /** The undo of a fix just written: the fix back. */
  undo: Undo | null;
  toast: { text: string; stamp: string } | null;
  /** The sheet is open: a failure shows there, else under the group. */
  open: boolean;
  setOpen: (open: boolean) => void;
  fix: (name: string) => Promise<boolean>;
};

const NameContext = createContext<NameValue | null>(null);

const settle = (run: Promise<MemberNameResult>) =>
  run.catch(() => ({ ok: false, failure: "failed" }) as const);

/**
 * Fixing the name the business shows for someone, on their page (ROADMAP
 * "תיקון שם"), for whoever may change their role: the business's own name for
 * them, shown everywhere in this business and nowhere else; their own name
 * stays theirs. The fix is written at once, and its undo, for a moment, is
 * the fix back, as a change between manager and worker. `name` is the name
 * the server has (null: none); the title, the row and the sentences follow
 * the screen's until the page is read again. The parts below read this
 * state; without it they draw nothing.
 */
export function MemberNameState({
  personId,
  name,
  rename,
  children,
}: {
  personId: string;
  name: string | null;
  rename: MemberChangeActions["rename"];
  children: ReactNode;
}) {
  const t = useTranslations("app.team.changes");
  // The name as the server has it, and as the screen shows it.
  const [seen, setSeen] = useState(name);
  const [shown, setShown] = useState(name);
  if (name !== seen) {
    setSeen(name);
    setShown(name);
  }
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TeamChangeActionFailure | null>(null);
  const [open, setOpenState] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );

  function clearUndo() {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }
  function showUndo(next: Undo) {
    clearUndo();
    setUndo(next);
    undoTimer.current = window.setTimeout(() => {
      undoTimer.current = null;
      setUndo((now) => (now === next ? null : now));
    }, HOLD_MS);
  }

  function setOpen(next: boolean) {
    // Each opening starts afresh: an old refusal stays with what it was for.
    if (next) setFailure(null);
    setOpenState(next);
  }

  /**
   * Writes `to`, a name `parseTeamName` kept, for the one the screen shows,
   * with the fix back as its undo. Whether the sheet may close.
   */
  async function fix(to: string): Promise<boolean> {
    const from = shown;
    if (to === from) return true;
    if (busy) return false;
    setFailure(null);
    clearUndo();
    setBusy(true);
    const result = await settle(rename(personId, to, from));
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    if (!result.changed) return true;
    const now = result.name;
    setShown(now);
    showUndo({
      message: t("nameChanged", { name: now ?? to }),
      run: () => void changeBack(from, now),
    });
    return true;
  }

  /**
   * The undo of a fix already written: the name it had, or none. The row
   * waits for it, so no fix goes out for a name the server doesn't have yet.
   */
  async function changeBack(from: string | null, to: string | null) {
    clearUndo();
    setFailure(null);
    setShown(from);
    setBusy(true);
    const result = await settle(rename(personId, from, to));
    setBusy(false);
    if (!result.ok) {
      setShown(to);
      setFailure(result.failure);
      return;
    }
    setToast({
      text: from ? t("nameBack", { name: from }) : t("nameBackNone"),
      stamp: new Date().toISOString(),
    });
  }

  // Leaving the screen: the undo goes with it, as a role change's does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(() => () => clearUndo(), []);

  return (
    <NameContext
      value={{ shown, busy, failure, undo, toast, open, setOpen, fix }}
    >
      {children}
    </NameContext>
  );
}

/** The name as the screen shows it, or `none` for none: the page's title. */
export function ShownName({ none }: { none: string }) {
  const value = use(NameContext);
  return value?.shown ?? none;
}

/**
 * Their place on the team, in one grouped list: "שם" with the name the
 * business shows, then "תפקיד" with their role, each opening its sheet; under
 * them, the undo or the word of each change.
 */
export function TeamPlace() {
  return (
    <div className="flex flex-col gap-2">
      <ListGroup>
        <MemberNameRow />
        <MemberRoleRow />
      </ListGroup>
      <MemberNameNotes />
      <MemberRoleNotes />
    </div>
  );
}

/**
 * "שם" with the name under it, so a long one wraps, which opens the sheet to
 * fix it. Its sheet comes after it: a sheet leaves a hidden mark in its
 * place, and the rows' hairlines count who comes first.
 */
function MemberNameRow() {
  const value = use(NameContext);
  const t = useTranslations("app.team.changes");
  const tTeam = useTranslations("app.team");
  if (!value) return null;
  return (
    <>
      <ListRow
        title={t("name")}
        subtitle={value.shown ?? tTeam("noName")}
        disabled={value.busy}
        onClick={() => value.setOpen(true)}
      />
      <Sheet
        open={value.open}
        onOpenChange={value.setOpen}
        title={t("nameSheet")}
        closeLabel={t("close")}
      >
        {/* Mounted on each opening, so it starts from the name shown. */}
        <NameForm value={value} />
      </Sheet>
    </>
  );
}

/** The words a refusal of a name shows: the name's own, else a team change's. */
function useNameFailure() {
  const t = useTranslations("app.team.changes");
  return (failure: TeamChangeActionFailure) =>
    failure === "notAllowed" || failure === "changed" || failure === "yourself"
      ? t(`nameFailures.${failure}`)
      : t(`failures.${failure}`);
}

function NameForm({ value }: { value: NameValue }) {
  const t = useTranslations("app.team.changes");
  const tInvite = useTranslations("app.team.invite");
  const failureText = useNameFailure();
  const [draft, setDraft] = useState(value.shown ?? "");
  const [error, setError] = useState<"required" | "tooLong" | null>(null);
  const parsed = parseTeamName(draft);
  const same = parsed.ok && parsed.name === value.shown;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.busy) return;
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (await value.fix(parsed.name)) value.setOpen(false);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 px-2 pt-2 pb-1"
    >
      <FieldGroup className="bg-elevated">
        <GroupedField
          name="member-name"
          label={tInvite("name")}
          placeholder={tInvite("namePlaceholder")}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={TEAM_NAME_MAX}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          error={error ? tInvite(`errors.name.${error}`) : undefined}
          required
        />
      </FieldGroup>
      <p className="px-2 text-pretty text-base text-ink-2">{t("nameNote")}</p>
      {value.failure ? (
        <p role="alert" className="text-center text-base text-danger">
          {failureText(value.failure)}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        loading={value.busy}
        disabled={same}
        className="w-full"
      >
        {t("nameSubmit")}
      </Button>
    </form>
  );
}

/**
 * Under the group: "השם שוב …" once a fix was taken back, the fix's undo while
 * it lasts, and why the last one was not made, while the sheet is closed.
 */
function MemberNameNotes() {
  const value = use(NameContext);
  const failureText = useNameFailure();
  if (!value) return null;
  return (
    <>
      <StatusToast
        message={value.toast?.text ?? null}
        stamp={value.toast?.stamp}
      />
      {value.undo ? (
        <UndoRow message={value.undo.message} onUndo={value.undo.run} />
      ) : null}
      {value.failure && !value.open ? (
        <p role="alert" className="px-1 text-base text-danger">
          {failureText(value.failure)}
        </p>
      ) : null}
    </>
  );
}
