"use client";

import { isolate } from "@domain/bidi";
import {
  againstTeam,
  type ImportRoleChoice,
  type ImportRoles,
  type KnownTeam,
  listRoleOf,
  type ParsedPeople,
  PEOPLE_IMPORT_MAX,
  parsePeopleList,
  WAITING_INVITES_MAX,
  writtenRoleOf,
} from "@domain/people-import";
import { displayIsraeliMobile } from "@domain/phone";
import { roleChoiceKey } from "@domain/team";
import { announce } from "@ui/announcer";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { DataTable } from "@ui/data-table";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { arrived, type FocusCandidate, focusFirst } from "@ui/focus-after";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonList, PersonRow } from "@ui/person-row";
import { StatusToast } from "@ui/status-toast";
import { TextArea } from "@ui/text-field";
import { UndoRow, type UndoRowProps } from "@ui/undo-row";
import { Check, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { HOLD_MS, useHeldWrite } from "../../use-held-write";
import type { PendingRow } from "../pending-links";
import { useInviteLinks } from "../resend-link";
import { doneLinksOf, type ExpiredRow } from "./done-links";
import {
  DoneExpired,
  DoneLinks,
  DoneSendList,
  type SendLinks,
} from "./done-send";
import { ignoredWords } from "./ignored-words";
import {
  type ImportMode,
  type LineActions,
  LineGroups,
  LinesTable,
  useLineWords,
} from "./import-lines";
import type {
  ImportPeople,
  PeopleImportFailure,
  PeopleImportResult,
  PeopleUndoResult,
  UndoPeopleImport,
} from "./import-types";
import { type LineSpan, lineRange, withoutLines } from "./paste-edit";
import { takeBackOf, withoutTakenBack } from "./taken-back";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** How long the screen waits after the last keystroke to say the counts. */
const SAY_AFTER_MS = 600;

/** The invite form's own refusals, said in its words (`app.team.invite.errors`). */
const INVITE_FAILURES = [
  "noPermission",
  "viewOnly",
  "demo",
  "notAllowed",
  "givesPay",
  "roleGone",
] as const;

const inInviteWords = (
  failure: PeopleImportFailure | "elsewhere",
): failure is (typeof INVITE_FAILURES)[number] =>
  (INVITE_FAILURES as readonly string[]).includes(failure);

/** Nothing to read: no role is left to give. */
const NOTHING: ParsedPeople = {
  lines: [],
  header: false,
  ignored: [],
  people: 0,
  error: null,
};

/** Someone an import wrote, as the console's done card lists them. */
type DonePerson = {
  /** The line, numbered as pasted: a row's key. */
  line: number;
  name: string;
  phone: string;
  /**
   * The role they end with, as the business words it; null when the screen
   * can't know it (`writtenRoleOf`), and no badge is drawn.
   */
  role: string | null;
  /** Above a worker: its badge stands out, so a wrong "manager" is seen. */
  above: boolean;
};

/** What an import did, as its done card says it. */
type Done = {
  importId: string | null;
  made: number;
  updated: number;
  /** Already on the team or among the invites, on the screen or in the database. */
  skipped: number;
  /** The invites it made, by id: the screen reads the team without them while they are taken back. */
  invites: readonly string[];
  /** Everyone it made or updated, in the order of the lines. */
  people: readonly DonePerson[];
  /**
   * The Team screen's: everyone on the list whose invite has no link yet,
   * theirs to make here (`doneLinksOf`), and those whose link ran out.
   */
  links: readonly PendingRow[];
  expired: readonly ExpiredRow[];
};

/** A refusal, said under the press, drawn anew for each answer. */
type Refusal = {
  failure: PeopleImportFailure | "elsewhere";
  /** With `tooManyOpen`: the invites the business has waiting. */
  open?: number;
  /** With `elsewhere`: how many numbers, and the first of their lines. */
  count?: number;
  line?: number;
  answer: number;
};

const NOBODY: ReadonlySet<string> = new Set();
const NO_LINKS: readonly PendingRow[] = [];

export type PeopleImportViewProps = {
  /**
   * Who imports: someone who edits the team, on its Team screen (the
   * default), or the ConceptApp team in the console, whose done card lists
   * the invites saved and says the owners send their links.
   */
  mode?: ImportMode;
  /** The roles the viewer gives, as the business words them (`importRolesOf`). */
  roles: ImportRoles;
  /**
   * The business's own team, as its Team screen reads it. The page reads it
   * again after each import and each undo, so a second list is read against
   * the invites the first one made.
   */
  known: KnownTeam;
  importPeople: ImportPeople;
  undoImport: UndoPeopleImport;
  paths: {
    back: { href: string; label: string };
    /** Where the done card goes back to. */
    done: { href: string; label: string };
  };
  /**
   * The Team screen's send list after an import (team mode only): each
   * person's link made at the moment of sending, then WhatsApp or a copy,
   * with the actions that make them; none, and the done card alone, without.
   */
  send?: SendLinks;
  /** What the field starts with: the twin's pastes. */
  initialPaste?: string;
  /**
   * The twin's states after an import: the paste imported as it opens
   * (`done`), and taken back too (`removed`), with the stand-in actions.
   */
  startAt?: "done" | "removed";
};

/**
 * Inviting many people at once from a pasted list ("הזמנה מרשימה"): the
 * role for the list, the paste, and what each line becomes, read on the
 * device (@domain/people-import) and checked against the team the page
 * loaded. Nothing goes while a line needs fixing; then everyone at once,
 * and nobody gets a message: the links are sent afterwards, one by one.
 * Phone: one thing under another. Tablet: the role and the paste beside
 * the lines. Computer: a wider column for the lines, in one table. The
 * same view for every route, each with its own actions, and for the twins
 * on /design with stand-ins that write nothing. From the console, a number
 * the database finds on another business's staff refuses the list, and
 * its line is marked to fix until it is removed. On the Team screen the done
 * screen lists everyone on the list with no link yet (`send`), each one's
 * link made there, one person at a time, and "קישור חדש" for those whose
 * link ran out: the done card at the start of a tablet's columns, the list
 * at their end; on a computer the card above, the list a table under it.
 * Its ways on (deleting the list's invites, back to the team, another list)
 * come after the list on a phone and a computer, under the card on a
 * tablet, so the first "יצירת קישור" follows the card's words.
 */
export function PeopleImportView({
  mode = "team",
  roles,
  known,
  importPeople,
  undoImport,
  paths,
  send: sendLinks,
  initialPaste = "",
  startAt,
}: PeopleImportViewProps) {
  const t = useTranslations("app.team.import");
  const ta = useTranslations("admin.peopleImport");
  const ti = useTranslations("app.team.invite");
  const tc = useTranslations("app.team.changes");
  const tt = useTranslations("app.team");
  const locale = useLocale();
  const inConsole = mode === "console";
  // The console makes no link: the owners send them from /team.
  const send = inConsole ? undefined : sendLinks;
  const words = useLineWords(roles, mode);
  const statusId = useId();
  /** Owners and accountants, as the business words them: invited one at a time. */
  const oneByOne = (role: "owner" | "accountant") =>
    roles.oneByOne.find((one) => one.role === role)?.label ?? "";
  const oneByOneRoles = {
    owner: oneByOne("owner"),
    accountant: oneByOne("accountant"),
  };

  const firstRole = listRoleOf(roles);
  const [roleKey, setRoleKey] = useState(
    firstRole ? roleChoiceKey(firstRole) : "",
  );
  const listRole: ImportRoleChoice | null =
    roles.choices.find(
      (choice) => !choice.blocked && roleChoiceKey(choice) === roleKey,
    ) ?? firstRole;

  const [paste, setPaste] = useState(initialPaste);
  const read = useDeferredValue(paste);
  const parsed = listRole ? parsePeopleList(read, roles, listRole) : NOTHING;
  /**
   * An import taken back, by its invites: those still with no link are left
   * out of whichever team the page read (the import's own reading can come
   * after the press), so its lines read as new again at once. Until it
   * comes back (kept, or its undo failed), or the next list starts or is
   * invited.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null);
  const team = withoutTakenBack(known, hidden);
  /** The numbers the console was told are on another business's staff. */
  const [elsewhere, setElsewhere] = useState<ReadonlySet<string>>(NOBODY);
  const check = againstTeam(parsed, team, elsewhere);
  // A keystroke not read yet: the press waits for it.
  const stale = read !== paste;

  const [done, setDone] = useState<Done | null>(null);
  const [removed, setRemoved] = useState<{
    done: Done;
    kept: number | null;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<Refusal | null>(null);
  const [undoFailed, setUndoFailed] = useState(0);
  const [toast, setToast] = useState<{
    text: string;
    stamp: number;
    before: string;
    /** The lines it took out, numbered as they were. */
    spans: LineSpan[];
  } | null>(null);

  const field = useRef<HTMLTextAreaElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const refusal = useRef<HTMLParagraphElement>(null);
  /** Where the focus goes as the done card shows: its title, or "מחיקת ההזמנות". */
  const doneFocus = useRef<"title" | "remove" | null>(null);
  /**
   * A removal's "ביטול" brought its lines back: the button that took them
   * out takes the focus once their rows are drawn again.
   */
  const restored = useRef<FocusCandidate>(null);
  /**
   * Edits typed into the field since the list was last started or invited:
   * each one waits for typing to pause, then says the counts unless they
   * were said already. A state, not a ref, so an edit that leaves the counts
   * as they were still says them the first time. None after an import, so
   * counts that change with nothing edited (an import taken back, whose
   * lines with a link made now read as invited) wait for the next edit,
   * never said over "ביטול"'s words.
   */
  const [edits, setEdits] = useState(0);
  /** The counts as last said (`summary`), so the same are never said again. */
  const said = useRef<string | null>(null);
  /**
   * How many of a taken-back import's invites its "ביטול" says stay, as its
   * words last changed (`TakenBackUndo`): the database's count is said after
   * the hold only when it differs, never the same sentence twice.
   */
  const keptSaid = useRef(0);

  /** Those the undo left, since a link was made for them meanwhile. */
  const keptWords = (count: number) =>
    inConsole
      ? ta("done.removedKept", { count })
      : t("done.removedKept", { count });

  // The import taken back, held for "ביטול" as a deleted invite is. Only
  // its invites with no link yet go; failing, the done card comes back. It
  // answers whether they went, for an import that waits for it.
  const held = useHeldWrite<{ importId: string; done: Done }>(
    async ({ importId, done: was }) => {
      let result: PeopleUndoResult;
      try {
        result = await undoImport(importId);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setRemoved(null);
        setHidden(null);
        doneFocus.current = "remove";
        setDone(was);
        setUndoFailed((count) => count + 1);
        return false;
      }
      setRemoved({ done: was, kept: result.kept });
      // Drawn under the field, where nothing reads it out: said, unless
      // "ביטול" said the same count as it held (its name, read as it took
      // the focus, or its words as they changed).
      if (result.kept > 0 && result.kept !== keptSaid.current) {
        announce(keptWords(result.kept), { lang: locale });
      }
      return true;
    },
  );

  const blocked = check.blocked;
  const ready = !blocked && check.send.length > 0 && !stale && !importing;
  const problems = check.counts.problems;

  async function importNow() {
    if (!ready) return;
    const sent = check.send;
    setImporting(true);
    // An import taken back and still held goes first, and is waited for:
    // sent after this one, it would cancel the invites this one found
    // waiting and left as they were. When it fails, its done card is back,
    // and nothing more goes.
    const takenBack = held.commit();
    if (takenBack && (await takenBack) === false) {
      setImporting(false);
      return;
    }
    let result: PeopleImportResult;
    try {
      result = await importPeople(
        sent.map(({ line: _line, ...person }) => person),
      );
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setImporting(false);
    if (!result.ok) {
      if (result.failure === "elsewhere") {
        // The rows' places among those sent, back to their numbers: each
        // line with one is marked to fix, whatever is edited around it.
        const far = result.rows.flatMap((place) => {
          const person = sent[place - 1];
          return person ? [person] : [];
        });
        setElsewhere(
          (now) => new Set([...now, ...far.map((person) => person.phone)]),
        );
        setFailure((now) => ({
          failure: "elsewhere",
          count: far.length,
          ...(far[0] ? { line: far[0].line } : {}),
          answer: (now?.answer ?? 0) + 1,
        }));
        return;
      }
      const { failure: why, open } = result;
      setFailure((now) => ({
        failure: why,
        ...(open !== undefined ? { open } : {}),
        answer: (now?.answer ?? 0) + 1,
      }));
      return;
    }
    const { counts } = check;
    setFailure(null);
    setRemoved(null);
    setHidden(null);
    setUndoFailed(0);
    // The counts are said again only after the next edit (`edits`).
    setEdits(0);
    // A line's removal is no longer to take back: its "ביטול" goes with it.
    setToast(null);
    doneFocus.current = "title";
    setDone(
      doneOf(
        result.importId,
        result.rows,
        sent,
        counts.member +
          counts.same +
          counts.invited +
          counts.locked +
          counts.expired +
          counts.otherRole,
      ),
    );
  }

  /**
   * What an import did, from the database's answer for each row sent (never
   * the preview's): `left` the lines the screen left out itself. Its send
   * list (the Team screen's) reads the team as it was at the press.
   */
  function doneOf(
    importId: string | null,
    rows: Extract<PeopleImportResult, { ok: true }>["rows"],
    sent: typeof check.send,
    left: number,
  ): Done {
    const of = (statuses: readonly string[]) =>
      rows.filter((row) => statuses.includes(row.status));
    const people = rows.flatMap((row): DonePerson[] => {
      const person = sent[row.i - 1];
      if (!person || (row.status !== "created" && row.status !== "updated")) {
        return [];
      }
      // The role by the database's answer, not the preview's: an invite
      // made meanwhile, elsewhere, kept a role the screen never read.
      const role = writtenRoleOf(
        row.status,
        person,
        check.lines.find((one) => one.line === person.line),
      );
      return [
        {
          line: person.line,
          name: person.name,
          phone: person.phone,
          role: role ? words.labelOf(role) : null,
          above: role?.role === "manager",
        },
      ];
    });
    const { links, expired } = doneLinksOf({
      rows,
      sent,
      lines: check.lines,
      team,
      labelOf: words.labelOf,
      noName: tt("noName"),
    });
    return {
      importId,
      made: of(["created"]).length,
      updated: of(["updated"]).length,
      skipped:
        left + of(["same", "member", "invited", "expired", "kept"]).length,
      invites: of(["created"]).flatMap((row) =>
        row.invite ? [row.invite] : [],
      ),
      people,
      links,
      expired,
    };
  }

  /**
   * Takes the import back: `cancels` its invites the undo cancels, those
   * still with no link (`takeBackOf`).
   */
  function takeBack(cancels: readonly string[]) {
    if (!done?.importId) return;
    setRemoved({ done, kept: null });
    // Those invites read as gone at once, as the undo will leave them; one
    // whose link was made here stays, before the page reads the team again.
    setHidden(new Set(cancels));
    setDone(null);
    setToast(null);
    held.hold({ importId: done.importId, done });
  }

  function keepImport() {
    const value = held.release();
    if (!value) return;
    setRemoved(null);
    setHidden(null);
    doneFocus.current = "remove";
    setDone(value.done);
  }

  function another() {
    setDone(null);
    setRemoved(null);
    setHidden(null);
    setElsewhere(NOBODY);
    setPaste("");
    setToast(null);
    setEdits(0);
    said.current = null;
    requestAnimationFrame(() => field.current?.focus());
  }

  // The done card takes the focus as it shows: its title after an import,
  // its "מחיקת ההזמנות" when the way back brought it back. Only a focus
  // lost (the press went with the form), never one put elsewhere.
  useLayoutEffect(() => {
    if (!done || !doneFocus.current) return;
    const to = doneFocus.current;
    doneFocus.current = null;
    focusFirst(
      to === "remove"
        ? ["[data-import-remove]", doneHeading.current]
        : [doneHeading.current],
    );
  }, [done]);

  // A refusal: the press lost the focus to its spinner, and takes it back,
  // where the refusal is read above it, brought into view (on a phone the
  // press floats, and the page stays where it was). Only as it arrives: a
  // screen shown again from its <Activity> runs this again with the same.
  // Numbers on another business's staff hold the press until their lines
  // go: the first one's "הסרת השורה" takes the focus instead, and the page
  // moves once, to that line, its reason beside it (the refusal is under
  // every line: brought into view too, it would take the line out of view
  // on a phone). With neither (the press held, the line not drawn), the
  // refusal itself has it, never the page's body.
  const seenFailure = useRef<typeof failure>(null);
  useLayoutEffect(() => {
    if (!arrived(seenFailure, failure)) return;
    const line =
      failure?.line !== undefined
        ? `[data-remove-line="${failure.line}"]`
        : null;
    const to = focusFirst([line, submit.current, refusal.current], {
      title: false,
    });
    if (!line || !to?.matches(line)) {
      refusal.current?.scrollIntoView({ block: "center" });
    }
  }, [failure]);

  // A removal taken back: the button that took the lines out has the focus
  // again, once their rows are drawn from the text as it is now.
  useLayoutEffect(() => {
    const to = restored.current;
    if (!to || read !== paste) return;
    restored.current = null;
    focusFirst([to, previewHeading.current, field.current]);
  }, [read, paste]);

  // The twin's states after an import, run once with its stand-ins.
  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the twin opens
  useEffect(() => {
    if (!startAt || started.current) return;
    started.current = true;
    void (async () => {
      const sent = check.send;
      const result = await importPeople(
        sent.map(({ line: _line, ...person }) => person),
      );
      if (!result.ok) return;
      const finished = doneOf(
        result.importId,
        result.rows,
        sent,
        check.counts.member + check.counts.same,
      );
      if (startAt === "removed" && finished.importId) {
        setRemoved({ done: finished, kept: null });
        setHidden(new Set(finished.invites));
        held.hold({ importId: finished.importId, done: finished });
      } else {
        doneFocus.current = "title";
        setDone(finished);
      }
    })();
  }, []);

  /**
   * A line's buttons: the same object at every keystroke, reading the paste
   * now. Their line numbers are the rows', read from `read`: while a
   * keystroke is not read yet, they would land on another line of the text
   * now, so a press waits for the rows, as the import's does.
   */
  const latest = useRef(paste);
  const drawn = useRef(read);
  useLayoutEffect(() => {
    latest.current = paste;
    drawn.current = read;
  });
  const [actions] = useState<LineActions>(() => ({
    fix: (span) => fixLine(span),
    remove: (span) => removeLines([span]),
  }));
  const rowsAreNow = () => drawn.current === latest.current;

  function fixLine(span: LineSpan) {
    const area = field.current;
    const range = lineRange(latest.current, span);
    if (!area || !range || !rowsAreNow()) return;
    area.focus();
    // The caret at the line's end, never the line selected: on a phone the
    // first key typed would replace all of it.
    area.setSelectionRange(range.end, range.end);
    // Bring the line into the field's view, near its middle.
    const total = Math.max(1, latest.current.split(/\r?\n/).length);
    area.scrollTop =
      ((span.line - 1) / total) * area.scrollHeight - area.clientHeight / 3;
  }

  function removeLines(spans: LineSpan[]) {
    const before = latest.current;
    const [one] = spans;
    if (!one || !rowsAreNow()) return;
    const text =
      spans.length > 1
        ? t("removedNoPhone", { count: spans.length })
        : one.last !== undefined
          ? t.markup("removedLines", {
              first: one.line,
              last: one.last,
              ltr: isolate,
            })
          : t.markup("removed", { line: one.line, ltr: isolate });
    setToast({ text, stamp: Date.now(), before, spans });
    setPaste(withoutLines(before, spans));
    setFailure(null);
  }

  // What the preview says, said once typing pauses.
  const statusWords = (): string | null => {
    switch (blocked) {
      case "invalid":
        return t("status.blocked", { count: problems });
      case "tooMany":
        return t.markup("status.tooMany", {
          max: PEOPLE_IMPORT_MAX,
          count: parsed.people,
          ltr: isolate,
        });
      case "tooLong":
        return t("status.tooLong");
      case "tooManyOpen": {
        // The console deletes no invite: its words ask the owners to.
        const values = {
          open: team.waiting,
          max: WAITING_INVITES_MAX,
          ltr: isolate,
        };
        return inConsole
          ? ta.markup("status.tooManyOpen", values)
          : t.markup("status.tooManyOpen", values);
      }
      case "phoneColumns":
        // A header named them: so do the words, and adding it is no fix.
        return parsed.phoneHeaders
          ? t("status.phoneColumnsHeaded", {
              names: new Intl.ListFormat(locale, {
                type: "conjunction",
              }).format(parsed.phoneHeaders),
            })
          : t("status.phoneColumns");
      case "nothingNew":
        return t("status.nothingNew");
      default:
        return null;
    }
  };
  const status = statusWords();
  // Only updates: the summary says so, as the button does ("עדכון # הזמנות").
  const onlyUpdates = check.send.length > 0 && check.counts.new === 0;
  const readyWords = onlyUpdates
    ? t("summary.update", { count: check.send.length })
    : t("summary.ready", { count: check.send.length });
  const summary = [readyWords, status].filter(Boolean).join(". ");
  // A refusal for numbers on another business's staff changes the counts
  // with nothing edited, and its alert says what changed: those counts are
  // taken as said, as it arrives (before the effect below reads them), and
  // said again only after the next edit or removal.
  const hushedFailure = useRef<typeof failure>(null);
  useLayoutEffect(() => {
    if (arrived(hushedFailure, failure) && failure?.failure === "elsewhere") {
      said.current = summary;
    }
  }, [failure, summary]);
  // Said only when it changed since it was last said: never again for an
  // import taken back, or a screen shown again from its <Activity>, with
  // the same counts.
  useEffect(() => {
    if (edits === 0 || done || said.current === summary) return;
    const later = setTimeout(() => {
      said.current = summary;
      announce(summary, { lang: locale });
    }, SAY_AFTER_MS);
    return () => clearTimeout(later);
  }, [summary, done, locale, edits]);

  const failureWords = (): ReactNode => {
    if (!failure) return null;
    const why = failure.failure;
    if (inInviteWords(why)) return ti(`errors.${why}`);
    if (why === "tooMany") {
      return t.rich("errors.tooMany", {
        max: PEOPLE_IMPORT_MAX,
        count: check.send.length,
        ltr,
      });
    }
    if (why === "elsewhere") {
      return ta("errors.elsewhere", {
        count: failure.count ?? 0,
        accountant: oneByOne("accountant"),
      });
    }
    if (why === "tooManyOpen") {
      const values = {
        open: failure.open ?? team.waiting,
        max: WAITING_INVITES_MAX,
        ltr,
      };
      return inConsole
        ? ta.rich("errors.tooManyOpen", values)
        : t.rich("errors.tooManyOpen", values);
    }
    return why === "businessChanged" || why === "changed"
      ? t(`errors.${why}`)
      : t("errors.failed");
  };

  const ignored = ignoredWords(parsed.ignored, t, locale);
  const teamLeftOut =
    check.counts.member +
    check.counts.same +
    check.counts.invited +
    check.counts.locked +
    check.counts.expired +
    check.counts.otherRole;
  const byRole = Object.entries(check.counts.byRole);
  const headerLine = parsed.lines.find((line) => line.kind === "header")?.line;
  const empty = parsed.lines.length === 0 && !blocked && parsed.people === 0;
  const label = onlyUpdates
    ? t("submitUpdate", { count: check.send.length })
    : t("submit", { count: check.send.length });
  const tooManyOpen = { open: team.waiting, max: WAITING_INVITES_MAX, ltr };
  /** The console's list of whom the import saved, beside its done card. */
  const saved = inConsole && done ? done.people : [];
  /** The Team screen's send list beside its done card, while anyone is on it. */
  const sending =
    send !== undefined &&
    done !== null &&
    done.links.length + done.expired.length > 0;
  /**
   * Its undo failed, the done card back: drawn anew for each failure, so
   * the same again is heard.
   */
  const removeFailed = (className?: string) =>
    undoFailed > 0 ? (
      <p
        key={undoFailed}
        role="alert"
        className={cn("px-1 text-danger", className)}
      >
        {inConsole ? ta("errors.removeFailed") : t("errors.removeFailed")}
      </p>
    ) : null;
  /**
   * The done card's ways on, as each shape places them (`DoneActions`).
   * With a send list, a failed undo is said among them, beside the delete
   * that takes the focus back, after the list (above the card, it would be
   * out of view as the page brings that button into view).
   */
  const doneActions = (className: string) =>
    done ? (
      <DoneActions
        done={done}
        known={known}
        inConsole={inConsole}
        back={paths.done}
        onRemove={takeBack}
        onAnother={another}
        alert={sending ? removeFailed("md:basis-full") : null}
        className={className}
      />
    ) : null;

  return (
    <DoneLinks
      send={send}
      // Its links kept while it is taken back, for its "ביטול".
      rows={(done ?? removed?.done)?.links ?? NO_LINKS}
    >
      <PageBody className={pageGlowClass}>
        <StatusToast
          message={toast?.text ?? null}
          stamp={toast ? String(toast.stamp) : undefined}
          // As long as a deleted invite's way back is offered.
          duration={HOLD_MS}
          action={
            toast
              ? {
                  label: t("undoRemove"),
                  onClick: () => {
                    // Where the person was: the line's "הסרת השורה", or
                    // "הסרת # השורות בלי מספר נייד", drawn again (above).
                    const [one] = toast.spans;
                    restored.current =
                      toast.spans.length > 1
                        ? "[data-remove-no-phone]"
                        : `[data-remove-line="${one?.line ?? 0}"]`;
                    setPaste(toast.before);
                    setToast(null);
                  },
                }
              : null
          }
          focusAction
          onFocusLeave={() => {
            // Taken back: its lines' own button takes the focus (above).
            if (restored.current) return;
            // Its time up: the line now in the removed one's place, else the
            // preview's title, or the done card's once an import is done.
            const at = toast?.spans[0]?.line;
            focusFirst([
              at !== undefined ? `[data-remove-line="${at}"]` : null,
              previewHeading.current,
              doneHeading.current,
            ]);
          }}
        />
        <PageHeader
          back={paths.back}
          title={inConsole ? ta("title") : t("title")}
          subtitle={inConsole ? ta("subtitle") : t("subtitle")}
        />
        {/* Above the card, which holds its delete; with a send list, among
            the ways on after the list (`doneActions`). */}
        {done && !sending ? removeFailed() : null}
        {done ? (
          <div
            className={
              sending
                ? // Beside the people to send links to: one under the other on
                  // a phone, the card, the list, then the ways on; the card
                  // and the ways on at the start of a tablet's columns, the
                  // list at their end; on a computer the card above, the list
                  // a table across under it, then the ways on.
                  "grid gap-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:items-start md:gap-8 xl:grid-cols-1 xl:grid-rows-none"
                : saved.length > 0
                  ? // Beside the people it saved, in the editor's columns: one
                    // under the other on a phone, the card at the start of a
                    // tablet's and a computer's, the people at their end.
                    "grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]"
                  : "contents"
            }
          >
            <Card
              tone="accent"
              padding="lg"
              className={cn(
                "flex flex-col gap-3",
                saved.length === 0 && "md:max-w-2xl",
              )}
            >
              <h2
                ref={doneHeading}
                tabIndex={-1}
                className="flex items-start gap-2 text-balance font-bold text-xl outline-none"
              >
                <Check aria-hidden="true" className="mt-1 size-6 shrink-0" />
                {t("done.title", { count: done.made })}
              </h2>
              {done.updated + done.skipped > 0 ? (
                <p>
                  {t("done.more", {
                    updated: done.updated,
                    skipped: done.skipped,
                  })}
                </p>
              ) : null}
              {inConsole ? (
                <p>{ta("done.console")}</p>
              ) : (
                <>
                  <p>{t("done.team")}</p>
                  <p>{t("done.later")}</p>
                </>
              )}
              {/* With a send list, after it (below), so on a phone the first
                  "יצירת קישור" follows these words, never the ways out. */}
              {sending ? null : doneActions("mt-1")}
            </Card>
            {saved.length > 0 ? <DonePeople people={saved} /> : null}
            {sending && send ? (
              <>
                <div className="flex min-w-0 flex-col gap-6 md:col-start-2 md:row-span-2 md:row-start-1 xl:col-start-1 xl:row-span-1 xl:row-start-2">
                  <DoneSendList count={done.links.length} />
                  <DoneExpired
                    rows={done.expired}
                    renew={send.renew}
                    share={send}
                  />
                </div>
                {doneActions("md:col-start-1 md:row-start-2 xl:row-start-3")}
              </>
            ) : null}
          </div>
        ) : (
          <>
            {held.held && removed ? (
              // Each import taken back is a row of its own, said afresh.
              <TakenBackUndo
                key={held.held.importId}
                done={removed.done}
                known={known}
                keptWords={keptWords}
                onKept={(kept) => {
                  keptSaid.current = kept;
                }}
                onUndo={keepImport}
                autoFocus
                onWaitingChange={(waiting) =>
                  waiting ? held.pause() : held.resume()
                }
                focusAfter={() => ["[data-import-remove]", field.current]}
                className="md:max-w-2xl"
              />
            ) : null}
            {removed ? (
              <p className="px-1 text-ink-2 md:max-w-2xl">
                {t("done.removedBack")}
                {removed.kept ? ` ${keptWords(removed.kept)}` : ""}
              </p>
            ) : (
              <p className="-mt-2 px-1 text-ink-2 md:-mt-4 md:max-w-2xl">
                {t("existing", {
                  members: team.members.length,
                  invites: team.waiting,
                })}
              </p>
            )}
            <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
              <div
                // Stuck beside the lines, it scrolls on its own when taller
                // than the screen, so the field it focuses comes into view.
                className="flex min-w-0 flex-col gap-6 md:sticky md:top-20 md:-mx-1 md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-13.5rem)] md:overflow-y-auto md:px-1 md:pb-4 xl:top-8 xl:max-h-[calc(100dvh-4rem)]"
              >
                <div className="flex flex-col gap-2">
                  <ChoiceList legend={t("role.label")}>
                    {roles.choices.map((choice) => {
                      const key = roleChoiceKey(choice);
                      const base = words.labelOf({
                        role: choice.role,
                        namedRole: null,
                      });
                      return (
                        <ChoiceRow
                          key={key}
                          name="import-role"
                          value={key}
                          checked={!choice.blocked && key === roleKey}
                          disabled={Boolean(choice.blocked)}
                          onChange={() => setRoleKey(key)}
                          title={choice.label}
                          hint={
                            choice.blocked === "pay"
                              ? tc("payHint")
                              : choice.blocked === "held"
                                ? tc("heldHint")
                                : choice.namedRole
                                  ? ti("namedHint", { role: base })
                                  : ti(`roleHint.${choice.role}`)
                          }
                        />
                      );
                    })}
                  </ChoiceList>
                  <p className="px-1 text-ink-2 text-sm">{t("role.hint")}</p>
                  <p className="px-1 text-ink-2 text-sm">
                    {inConsole
                      ? ta("role.oneByOne", oneByOneRoles)
                      : t(
                          words.givesOneByOne
                            ? "role.oneByOne"
                            : "role.oneByOneOwners",
                          oneByOneRoles,
                        )}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <TextArea
                    ref={field}
                    label={t("paste.label")}
                    hint={t("paste.hint")}
                    placeholder={t("paste.placeholder")}
                    rows={8}
                    dir="auto"
                    spellCheck={false}
                    autoComplete="off"
                    value={paste}
                    onChange={(event) => {
                      setEdits((count) => count + 1);
                      setPaste(event.target.value);
                      setFailure(null);
                      // A removal's "ביטול" brings back the text as it was
                      // then, so it goes once the text changes since.
                      setToast(null);
                    }}
                  />
                  <p className="flex items-start gap-1.5 px-1 text-ink-2 text-sm">
                    <ShieldCheck
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>{t("paste.kept")}</span>
                  </p>
                  {ignored.length > 0 ? (
                    <p className="px-1 text-ink-2 text-sm">
                      {ignored.join(" ")}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <PageSection
                  title={t("preview.title")}
                  headingRef={previewHeading}
                >
                  {empty ? (
                    <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
                      {t("preview.empty")}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {parsed.lines.length > 0 ? (
                        <Card
                          tone="accent"
                          padding="lg"
                          className="flex flex-col gap-1"
                        >
                          <p className="font-semibold text-md">{readyWords}</p>
                          {byRole.length > 0 ? (
                            <p>
                              {byRole.map(([key, count], index) => (
                                <span key={key}>
                                  {index > 0 ? " · " : null}
                                  {t.rich("summary.byRole", {
                                    role: words.labelOfKey(key),
                                    count,
                                    ltr,
                                  })}
                                </span>
                              ))}
                            </p>
                          ) : null}
                          {problems > 0 ? (
                            <p>{t("summary.fix", { count: problems })}</p>
                          ) : null}
                          {teamLeftOut > 0 ? (
                            <p>
                              {t("summary.leftOut", { count: teamLeftOut })}
                            </p>
                          ) : null}
                          {headerLine !== undefined ? (
                            <p>
                              {t.rich("summary.header", {
                                line: headerLine,
                                ltr,
                              })}
                            </p>
                          ) : null}
                        </Card>
                      ) : null}
                      {parsed.lines.length > 0 ? (
                        <>
                          <div className="xl:hidden">
                            <LineGroups
                              lines={check.lines}
                              words={words}
                              actions={actions}
                              removeNoPhone={(spans) => removeLines(spans)}
                            />
                          </div>
                          <div className="hidden xl:block">
                            <LinesTable
                              // Drawn anew, its filter back to all, by each
                              // number found on another business's staff (the
                              // set only grows): the line marked is on screen
                              // as its removal takes the focus (below).
                              key={elsewhere.size}
                              lines={check.lines}
                              words={words}
                              actions={actions}
                              removeNoPhone={(spans) => removeLines(spans)}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </PageSection>
                {failure ? (
                  // Beside the press it answers, drawn anew for each answer,
                  // so the same refusal again is heard.
                  <p
                    key={failure.answer}
                    ref={refusal}
                    role="alert"
                    className="px-1 text-danger"
                  >
                    {failureWords()}
                  </p>
                ) : null}
                {status ? (
                  <p id={statusId} className="px-1 font-medium">
                    {blocked === "tooMany"
                      ? t.rich("status.tooMany", {
                          max: PEOPLE_IMPORT_MAX,
                          count: parsed.people,
                          ltr,
                        })
                      : blocked === "tooManyOpen"
                        ? inConsole
                          ? ta.rich("status.tooManyOpen", tooManyOpen)
                          : t.rich("status.tooManyOpen", tooManyOpen)
                        : status}
                  </p>
                ) : null}
                {!empty ? (
                  <>
                    <p className="px-1 text-ink-2 text-sm">
                      {t("status.notSent")}
                    </p>
                    <FloatingAction>
                      <Button
                        ref={submit}
                        size="lg"
                        loading={importing}
                        disabled={!ready}
                        aria-describedby={status ? statusId : undefined}
                        className={cn(
                          "w-full md:w-auto md:shadow-none",
                          floatingButtonClass,
                        )}
                        onClick={() => void importNow()}
                      >
                        <UserPlus aria-hidden="true" />
                        {label}
                      </Button>
                    </FloatingAction>
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}
      </PageBody>
    </DoneLinks>
  );
}

/**
 * What taking the import back does now (`takeBackOf`): the links made on
 * this screen (`InviteLinks`, under `DoneLinks`; none in the console), the
 * team as the page last read it, and the numbers the import invited, so one
 * who joined meanwhile counts as neither cancelled nor kept.
 */
function useTakeBack(done: Done, known: KnownTeam) {
  const links = useInviteLinks();
  return takeBackOf(
    done.invites,
    known,
    (id) => links?.links.has(id) === true,
    done.people.map((person) => person.phone),
  );
}

/**
 * The done card's ways on: "מחיקת ההזמנות מהרשימה" while its undo would
 * cancel any of the import's invites (one whose link was made since stays
 * either way, so with every link made it is not offered), back to the team,
 * and another list. The console says first that only here are they deleted
 * together. `className` places the row in the shape it is drawn in; `alert`
 * (a failed undo) comes first in it, beside the delete.
 */
function DoneActions({
  done,
  known,
  inConsole,
  back,
  onRemove,
  onAnother,
  alert,
  className,
}: {
  done: Done;
  known: KnownTeam;
  inConsole: boolean;
  back: { href: string; label: string };
  /** Takes the import back, with the invites its undo cancels, to hide. */
  onRemove: (cancels: readonly string[]) => void;
  onAnother: () => void;
  alert: ReactNode;
  className: string;
}) {
  const t = useTranslations("app.team.import");
  const ta = useTranslations("admin.peopleImport");
  const removeHereId = useId();
  const { cancels } = useTakeBack(done, known);
  const removable = done.importId !== null && cancels.length > 0;
  return (
    <>
      {inConsole && removable ? (
        // The console deletes no invite one at a time: once this card goes
        // ("הזמנה מרשימה נוספת" too, or leaving the screen), only the owners
        // can, on their Team screen. Its words say so.
        <p id={removeHereId}>{ta("done.removeHere")}</p>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-2 md:flex-row md:flex-wrap",
          className,
        )}
      >
        {alert}
        {removable ? (
          <Button
            variant="secondary"
            data-import-remove=""
            aria-describedby={inConsole ? removeHereId : undefined}
            onClick={() => onRemove(cancels)}
          >
            <Trash2 aria-hidden="true" />
            {t("done.remove")}
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={back.href}>{back.label}</Link>
        </Button>
        <Button variant="ghost" onClick={onAnother}>
          {t("done.another")}
        </Button>
      </div>
    </>
  );
}

/**
 * "ביטול" for an import taken back, while it holds: how many of its invites
 * go, and, said at once, how many stay since a link was made for them
 * meanwhile (the undo cancels only those with none). A link that arrives
 * while it holds changes its words. The database's own count is drawn
 * after, under the field, and said only when it differs from the one these
 * words last said (`onKept`).
 */
function TakenBackUndo({
  done,
  known,
  keptWords,
  onKept,
  ...row
}: Omit<UndoRowProps, "message"> & {
  done: Done;
  known: KnownTeam;
  keptWords: (count: number) => string;
  /** Hears how many its words say stay, as they appear and change. */
  onKept: (kept: number) => void;
}) {
  const t = useTranslations("app.team.import");
  const { cancels, kept } = useTakeBack(done, known);
  useLayoutEffect(() => {
    onKept(kept);
  }, [kept, onKept]);
  const message = [
    cancels.length > 0 ? t("done.removed", { count: cancels.length }) : null,
    kept > 0 ? keptWords(kept) : null,
  ]
    .filter(Boolean)
    .join(". ");
  return <UndoRow {...row} message={message} />;
}

/**
 * The console's list of the invites an import saved, with no link to make:
 * the owners send those from the Team screen. A phone's rows under the done
 * card, a tablet's beside it, a computer's table beside it.
 */
function DonePeople({ people }: { people: readonly DonePerson[] }) {
  const t = useTranslations("app.team.import");
  const ta = useTranslations("admin.peopleImport");
  const number = (phone: string) => (
    // A number in one piece: never broken at its dashes.
    <span dir="ltr" className="whitespace-nowrap tabular-nums">
      {displayIsraeliMobile(phone)}
    </span>
  );
  const role = (person: DonePerson) =>
    person.role ? (
      <Badge tone={person.above ? "accent" : "neutral"}>{person.role}</Badge>
    ) : null;
  return (
    <PageSection title={ta("done.people")}>
      <PersonList aria-label={ta("done.people")} className="xl:hidden">
        {people.map((person) => (
          <PersonRow
            key={person.line}
            name={person.name}
            title={person.name}
            subtitle={number(person.phone)}
            trailing={role(person)}
          />
        ))}
      </PersonList>
      <Card padding="none" className="hidden overflow-hidden xl:block">
        <DataTable
          caption={ta("done.people")}
          columns={[
            { key: "name", label: t("columns.name") },
            { key: "phone", label: t("columns.phone") },
            { key: "role", label: t("columns.role") },
          ]}
          rows={people.map((person) => ({
            key: String(person.line),
            cells: {
              name: <span className="font-medium">{person.name}</span>,
              phone: number(person.phone),
              role: role(person),
            },
          }))}
        />
      </Card>
    </PageSection>
  );
}
