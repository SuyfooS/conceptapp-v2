"use client";

import {
  parseTeamName,
  TEAM_NAME_MAX,
  unchangedMemberName,
} from "@domain/team";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { arrived, firstOnScreen, focusFirst } from "@ui/focus-after";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { UndoRow } from "@ui/undo-row";
import { useTranslations } from "next-intl";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  type RefObject,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  answerHeard,
  focusAt,
  useQuietWhy,
} from "../../../(auth)/step-results";
import { type HeldTimer, heldTimer } from "../../held-timer";
import { HOLD_MS } from "../../use-held-write";
import type {
  MemberChangeActions,
  MemberNameResult,
  TeamChangeActionFailure,
} from "../team-change-types";
import { MemberRoleNotes, MemberRoleRow, useShownRole } from "./member-changes";

/** A fix's undo: each fix a row of its own (`key`), said and focused afresh. */
type Undo = { key: string; message: string; run: () => void };

/**
 * What a fix came to: refused (the sheet stays open), nothing written (the
 * name as it was, or the same once stored), or written, with its undo.
 */
type Fixed = false | "same" | "written";

/** A name the screen shows, and whether it is the business's own for them. */
type Shown = { name: string | null; kept: boolean };

type NameValue = {
  /**
   * The server offers the name to fix: never an owner's (`canFixName`). The
   * parts wait out a change to owner too (`useFixes`).
   */
  fixes: boolean;
  /** The name as the screen shows it now; null: none. */
  shown: string | null;
  /** Whether that is the business's own name for them, not their own. */
  kept: boolean;
  busy: boolean;
  failure: TeamChangeActionFailure | null;
  /** The undo of a fix just written: the fix back. */
  undo: Undo | null;
  /** Its "ביטול" is being reached: its time waits as long. */
  undoWaits: (waiting: boolean) => void;
  /** The row "שם", once pressed: where the focus comes back to. */
  nameRow: RefObject<HTMLButtonElement | null>;
  keepNameRow: (row: HTMLButtonElement) => void;
  /** The undo's "ביטול": the sheet closes onto it after a fix. */
  undoButton: RefObject<HTMLButtonElement | null>;
  toast: { text: string; stamp: string } | null;
  /** The sheet is open: a failure shows there, else under the group. */
  open: boolean;
  setOpen: (open: boolean) => void;
  fix: (name: string) => Promise<Fixed>;
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
 * the server has (null: none), and `kept` whether it is the business's own
 * for them rather than their own; the title, the row and the sentences
 * follow the screen's until the page is read again. `fixes` false, for an
 * owner, who appears by their own name (`canFixName`), offers no fix: no
 * row, sheet, undo or refusal, and the title is the name the server has.
 * It stays mounted either way, so a role change that makes someone an owner,
 * or no longer one, keeps that change's own undo and words when the page is
 * read again. The parts below read this state; without it they draw
 * nothing.
 */
export function MemberNameState({
  personId,
  name,
  kept,
  fixes,
  rename,
  children,
}: {
  personId: string;
  name: string | null;
  kept: boolean;
  fixes: boolean;
  rename: MemberChangeActions["rename"];
  children: ReactNode;
}) {
  const t = useTranslations("app.team.changes");
  // The name as the server has it, and as the screen shows it.
  const [seen, setSeen] = useState<Shown>({ name, kept });
  const [shown, setShown] = useState<Shown>({ name, kept });
  if (name !== seen.name || kept !== seen.kept) {
    setSeen({ name, kept });
    setShown({ name, kept });
  }
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TeamChangeActionFailure | null>(null);
  const [open, setOpenState] = useState(false);
  // Made an owner: a sheet left open closes, and stays closed after.
  if (!fixes && open) setOpenState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  // The undo waits as a held write does, and stops while its "ביטול" is
  // being reached.
  const undoTimer = useRef<HeldTimer | null>(null);
  const undos = useRef(0);
  const nameRow = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );

  function keepNameRow(row: HTMLButtonElement) {
    nameRow.current = row;
  }

  function clearUndo() {
    undoTimer.current?.clear();
    undoTimer.current = null;
    setUndo(null);
  }
  function showUndo(next: Omit<Undo, "key">) {
    clearUndo();
    undos.current += 1;
    const shownUndo: Undo = { ...next, key: String(undos.current) };
    setUndo(shownUndo);
    undoTimer.current = heldTimer(HOLD_MS, () => {
      undoTimer.current = null;
      setUndo((now) => (now === shownUndo ? null : now));
    });
  }
  function undoWaits(waiting: boolean) {
    if (waiting) undoTimer.current?.pause();
    else undoTimer.current?.resume();
  }

  function setOpen(next: boolean) {
    // Each opening starts afresh: an old refusal stays with what it was for.
    if (next) setFailure(null);
    setOpenState(next);
  }

  /**
   * Writes `to`, a name `parseTeamName` kept, for the one the screen shows,
   * with the fix back as its undo; nothing when that writes nothing
   * (`unchangedMemberName`: a name the business keeps with what nobody sees
   * is saved clean; their own name keeps no row, however it is stored).
   * Whether the sheet may close, and whether a fix was written, with its
   * undo, which the sheet closes onto.
   */
  async function fix(to: string): Promise<Fixed> {
    const from = shown;
    if (unchangedMemberName(to, from.name, from.kept)) return "same";
    if (busy) return false;
    setFailure(null);
    clearUndo();
    setBusy(true);
    const result = await settle(rename(personId, to, from.name));
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    if (!result.changed) return "same";
    // The server keeps `to` as sent and answers with it, unless it is their
    // own name, which keeps no row: then it answers with theirs as stored.
    const now: Shown = { name: result.name, kept: result.name === to };
    setShown(now);
    showUndo({
      message: t("nameChanged", { name: now.name ?? to }),
      run: () => void changeBack(from, now),
    });
    return "written";
  }

  /**
   * The undo of a fix already written: the name it had, or none. The row
   * waits for it, so no fix goes out for a name the server doesn't have yet.
   */
  async function changeBack(from: Shown, to: Shown) {
    clearUndo();
    setFailure(null);
    setShown(from);
    setBusy(true);
    const result = await settle(rename(personId, from.name, to.name));
    setBusy(false);
    if (!result.ok) {
      setShown(to);
      setFailure(result.failure);
      return;
    }
    setToast({
      text: from.name ? t("nameBack", { name: from.name }) : t("nameBackNone"),
      stamp: new Date().toISOString(),
    });
  }

  // Leaving the screen: the undo goes with it, as a role change's does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(() => () => clearUndo(), []);

  return (
    <NameContext
      value={{
        fixes,
        shown: shown.name,
        kept: shown.kept,
        busy,
        failure,
        undo,
        undoWaits,
        nameRow,
        keepNameRow,
        undoButton,
        toast,
        open,
        setOpen,
        fix,
      }}
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
 * Whether the screen offers to fix the name: as the server says (`fixes`),
 * but never while the role the screen shows is owner. A change to owner is
 * held for its undo (`roleChangeClears`), and once written the database
 * drops the business's name for them (`private.drop_owner_name`), so a fix
 * made in the meantime, or its undo, would be said and then lost.
 */
function useFixes(value: NameValue | null): boolean {
  const shown = useShownRole();
  return value?.fixes === true && shown?.role.role !== "owner";
}

/**
 * Their place on the team, in one grouped list: "שם" with the name the
 * business shows, then "תפקיד" with their role, each opening its sheet; under
 * them, the undo or the word of each change. For an owner, "תפקיד" alone, as
 * soon as the screen shows them as one.
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
 * place, and the rows' hairlines count who comes first. None for an owner,
 * nor while a change to owner waits for its undo (`useFixes`). A fix
 * written closes the sheet onto its "ביטול", which came while the sheet was
 * open; anything else, onto the row.
 */
function MemberNameRow() {
  const value = use(NameContext);
  const fixes = useFixes(value);
  const t = useTranslations("app.team.changes");
  const tTeam = useTranslations("app.team");
  // A fix was written in this opening: the sheet closes onto its undo.
  const written = useRef(false);
  if (!value || !fixes) return null;
  return (
    <>
      <ListRow
        title={t("name")}
        subtitle={value.shown ?? tTeam("noName")}
        // Dimmed while a fix or its undo is on its way, and still
        // reachable: the focus comes back to it when the undo goes.
        disabled={value.busy ? "focusable" : false}
        onClick={(event) => {
          value.keepNameRow(event.currentTarget);
          written.current = false;
          value.setOpen(true);
        }}
      />
      <Sheet
        open={value.open}
        // Held while the fix is on its way: its answer belongs on this
        // sheet, which then closes onto its "ביטול" (✕, Escape, the scrim
        // and a swipe wait for it, as Sheet asks).
        onOpenChange={(next) => {
          if (next || !value.busy) value.setOpen(next);
        }}
        title={t("nameSheet")}
        closeLabel={t("close")}
        returnFocus={() => {
          const back = written.current
            ? [value.undoButton.current, value.nameRow.current]
            : [value.nameRow.current];
          written.current = false;
          return firstOnScreen(back);
        }}
      >
        {/* Mounted on each opening, so it starts from the name shown. */}
        <NameForm
          value={value}
          onDone={(fixed) => {
            written.current = fixed === "written";
            value.setOpen(false);
          }}
        />
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

/** A name the sheet refused itself, and how many it refused before it. */
type Refused = { why: "required" | "tooLong"; count: number };

/** A fix the server refused, and how many it refused before it. */
type Declined = { count: number };

/**
 * The name to fix, in the sheet. A name it refuses itself (none, too long)
 * is said once, through the page's announcer, as the invite form says its
 * name (`answerHeard`): from the press, the field takes the focus and why is
 * said after its read; from the field itself (Enter), it is said at once.
 * Either way the field keeps the focus, read as invalid, with why out of its
 * description meanwhile (`useQuietWhy`), so it isn't said twice. Each
 * refusal is its own (`Refused.count`), so the same one again is heard too.
 * A fix the server refuses is said by its line; the press, busy while the
 * fix was on its way, lost the focus, and takes it back (`Declined`), else
 * the field, so it never stays on the sheet's frame.
 */
function NameForm({
  value,
  onDone,
}: {
  value: NameValue;
  /** The fix went through (`Fixed`): the sheet closes. */
  onDone: (fixed: Exclude<Fixed, false>) => void;
}) {
  const t = useTranslations("app.team.changes");
  const tInvite = useTranslations("app.team.invite");
  const failureText = useNameFailure();
  const field = useRef<HTMLInputElement>(null);
  const press = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(value.shown ?? "");
  const [refused, setRefused] = useState<Refused | null>(null);
  const refusals = useRef(0);
  const seen = useRef<Refused | null>(null);
  const [declined, setDeclined] = useState<Declined | null>(null);
  const seenDeclined = useRef<Declined | null>(null);
  const { quiet, hush } = useQuietWhy(field);
  const why = refused ? tInvite(`errors.name.${refused.why}`) : undefined;
  const parsed = parseTeamName(draft);
  // A name stored with a double space, or with its letters decomposed, is no
  // fix until a letter really differs. One the business keeps with what
  // nobody sees (a direction mark, a zero-width space) is, and saving it
  // cleans it; their own name it never cleans, so there it is none.
  const same = unchangedMemberName(draft, value.shown, value.kept);

  // Each refusal once, as it is drawn (`arrived`), in the drawing's own
  // pass, so a field that keeps the focus is drawn without why in its
  // description.
  useLayoutEffect(() => {
    const at = field.current;
    if (!arrived(seen, refused) || !refused || !why || !at) return;
    const said = answerHeard({ error: why, at: focusAt(at) });
    if (said.focus) at.focus();
    if (said.say) announce(said.say.words, { politeness: said.say.politeness });
    if (said.quiet) hush(refused.count);
  }, [refused, why, hush]);

  // Each of the server's refusals once, as it is drawn with the press no
  // longer busy: only while the focus is lost, so where the person put it
  // meanwhile stays.
  useLayoutEffect(() => {
    if (!arrived(seenDeclined, declined)) return;
    focusFirst([press.current, field.current], { title: false });
  }, [declined]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.busy) return;
    if (!parsed.ok) {
      refusals.current += 1;
      setRefused({ why: parsed.error, count: refusals.current });
      return;
    }
    const fixed = await value.fix(parsed.name);
    if (fixed) onDone(fixed);
    else setDeclined((was) => ({ count: (was?.count ?? 0) + 1 }));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 px-2 pt-2 pb-1"
    >
      <FieldGroup className="bg-elevated">
        <GroupedField
          ref={field}
          name="member-name"
          label={tInvite("name")}
          placeholder={tInvite("namePlaceholder")}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={TEAM_NAME_MAX}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefused(null);
          }}
          error={why}
          quietMessage={refused !== null && quiet === refused.count}
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
        ref={press}
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
 * it lasts, and why the last one was not made, while the sheet is closed;
 * neither once they are an owner, whose name nobody fixes, nor while a
 * change to owner waits for its undo (`useFixes`).
 */
function MemberNameNotes() {
  const value = use(NameContext);
  const fixes = useFixes(value);
  const failureText = useNameFailure();
  if (!value) return null;
  return (
    <>
      <StatusToast
        message={value.toast?.text ?? null}
        stamp={value.toast?.stamp}
      />
      {fixes && value.undo ? (
        // Quiet: the sheet closes onto it (it holds its close until the
        // fix's answer), and its focus says its words. Another fix while it
        // is up is a row of its own. Undone, or its time up, the focus goes
        // back to the row "שם".
        <UndoRow
          key={value.undo.key}
          message={value.undo.message}
          onUndo={value.undo.run}
          quiet
          buttonRef={value.undoButton}
          onWaitingChange={value.undoWaits}
          focusAfter={() => [value.nameRow.current]}
        />
      ) : null}
      {fixes && value.failure && !value.open ? (
        <p role="alert" className="px-1 text-base text-danger">
          {failureText(value.failure)}
        </p>
      ) : null}
    </>
  );
}
