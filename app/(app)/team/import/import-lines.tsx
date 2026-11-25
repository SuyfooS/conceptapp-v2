"use client";

import {
  type CheckedLine,
  groupOf,
  type ImportRoles,
  type PeopleNote,
  tableOrder,
} from "@domain/people-import";
import { displayIsraeliMobile } from "@domain/phone";
import { type RoleChoice, roleChoiceKey } from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { DataTable } from "@ui/data-table";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { Segmented } from "@ui/segmented";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, type ReactNode, useState } from "react";
import type { LineSpan } from "./paste-edit";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** What a row's buttons do, the same object for every row and every keystroke. */
export type LineActions = {
  fix: (span: LineSpan) => void;
  remove: (span: LineSpan) => void;
};

type Person = Extract<CheckedLine, { kind: "person" }>;

/**
 * The words of the import's lines, in the business's words for its roles:
 * a line's number, its problem, what happens to it, its notes and what of
 * it wasn't read. The same in every shape.
 */
export function useLineWords(roles: ImportRoles) {
  const t = useTranslations("app.team.import");

  /** A role as the business words it, by its choice. */
  const labelOf = (choice: RoleChoice): string => {
    const staff =
      roles.choices.find(
        (one) => one.role === choice.role && one.namedRole === choice.namedRole,
      ) ??
      roles.aboveRank.find(
        (one) => one.role === choice.role && one.namedRole === choice.namedRole,
      );
    if (staff) return staff.label;
    const oneByOne = roles.oneByOne.find((one) => one.role === choice.role);
    if (oneByOne) return oneByOne.label;
    // A named role no longer among them: its base, as the business words it.
    return choice.namedRole !== null
      ? labelOf({ role: choice.role, namedRole: null })
      : choice.role;
  };
  /** A role by its key (`roleChoiceKey`), as `TeamCheck.counts.byRole` counts them. */
  const labelOfKey = (key: string): string => {
    const choice =
      roles.choices.find((one) => roleChoiceKey(one) === key) ??
      roles.aboveRank.find((one) => roleChoiceKey(one) === key);
    return choice?.label ?? key;
  };

  /** "שורה 12", or a name line and its number line, "שורות 3–4". */
  const lineLabel = (line: LineSpan): ReactNode =>
    line.last !== undefined
      ? t.rich("lines", { first: line.line, last: line.last, ltr })
      : t.rich("line", { line: line.line, ltr });
  /** The same in plain text, for a button's name. */
  const lineName = (line: LineSpan): string =>
    line.last !== undefined ? `${line.line}–${line.last}` : String(line.line);

  const problemOf = (line: CheckedLine): ReactNode => {
    if (line.kind !== "problem") return null;
    switch (line.problem) {
      case "excelNumber":
        return t.rich("problem.excelNumber", { ltr });
      case "duplicate":
        return t.rich("problem.duplicate", { line: line.first ?? 0, ltr });
      case "unknownRole":
        return t("problem.unknownRole", { word: line.word ?? "" });
      case "oneByOne":
      case "notAllowed":
      case "givesPay":
      case "held":
        return t(`problem.${line.problem}`, { role: line.roleLabel ?? "" });
      default:
        return t(`problem.${line.problem}`);
    }
  };

  /** The role a person ends with: an invite waiting keeps its own when the line named none. */
  const roleOf = (line: Person): RoleChoice =>
    line.outcome === "updateName" && line.invite
      ? line.invite
      : { role: line.person.role, namedRole: line.person.namedRole };

  const outcomeOf = (line: CheckedLine): ReactNode => {
    switch (line.outcome) {
      case "new":
        return line.kind === "person"
          ? t("outcome.new", { role: line.roleLabel })
          : null;
      case "update":
        return t("outcome.update");
      case "updateName":
        return t("outcome.updateName", {
          role: line.invite ? labelOf(line.invite) : "",
        });
      case "updateRole":
        return line.kind === "person"
          ? t("outcome.updateRole", { role: line.roleLabel })
          : null;
      case "same":
        return t("outcome.same");
      case "member": {
        const own = line.kind === "person" ? line.person.name : null;
        return line.memberName && line.memberName !== own
          ? t("outcome.memberAs", { name: line.memberName })
          : t("outcome.member");
      }
      case "invited":
        return t("outcome.invited");
      case "expired":
        return t("outcome.expired");
      case "otherRole":
        return t("outcome.otherRole", {
          role: line.invite ? labelOf(line.invite) : "",
        });
      default:
        break;
    }
    if (line.kind === "header") return t("outcome.header");
    if (line.kind === "title") return t("outcome.title");
    if (line.kind === "sameLine") {
      return t.rich("outcome.sameLine", { line: line.first, ltr });
    }
    return problemOf(line);
  };

  const noteOf = (note: PeopleNote): ReactNode => {
    switch (note.kind) {
      case "sameNameTeam":
        return t("note.sameNameTeam", { name: note.name });
      case "sameNameList":
        return t.rich("note.sameNameList", { line: note.line, ltr });
      case "trailingWord":
        return t.rich("note.trailingWord", {
          word: note.word,
          count: note.count,
          ltr,
        });
    }
  };

  const droppedOf = (line: CheckedLine): string | null =>
    line.dropped.length > 0
      ? t("outcome.dropped", { text: line.dropped.join(", ") })
      : null;

  return {
    labelOf,
    labelOfKey,
    lineLabel,
    lineName,
    problemOf,
    roleOf,
    outcomeOf,
    noteOf,
    droppedOf,
  };
}

type Words = ReturnType<typeof useLineWords>;

/** A row's props that change what it draws: the rest stays the same. */
const sameLine = (
  a: { line: CheckedLine; signature: string; words: Words },
  b: { line: CheckedLine; signature: string; words: Words },
) => a.signature === b.signature;

/** What a line draws, as a string: a row is drawn again only when it changes. */
export function lineSignature(line: CheckedLine): string {
  return JSON.stringify(line);
}

/** The notes and what wasn't read, under a row. */
function RowNotes({ line, words }: { line: CheckedLine; words: Words }) {
  const notes = line.kind === "person" ? line.notes : [];
  const dropped = words.droppedOf(line);
  if (notes.length === 0 && !dropped) return null;
  return (
    <>
      {notes.map((note) => (
        <span
          key={JSON.stringify(note)}
          className="block font-medium text-sm text-warning"
        >
          {words.noteOf(note)}
        </span>
      ))}
      {dropped ? (
        <span className="block break-words text-ink-2 text-sm">{dropped}</span>
      ) : null}
    </>
  );
}

/** "תיקון השורה" and "הסרת השורה", each named with the line it is for. */
function FixButtons({
  line,
  words,
  actions,
}: {
  line: CheckedLine;
  words: Words;
  actions: LineActions;
}) {
  const t = useTranslations("app.team.import");
  const span = { line: line.line, last: line.last };
  const name = words.lineName(span);
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        aria-label={t("fixLineFor", { line: name })}
        onClick={() => actions.fix(span)}
      >
        {t("fixLine")}
      </Button>
      <Button
        variant="ghost"
        aria-label={t("removeLineFor", { line: name })}
        onClick={() => actions.remove(span)}
      >
        {t("removeLine")}
      </Button>
    </span>
  );
}

const rowLine =
  "relative not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/** A line to fix: its number, as pasted, what is wrong, and the way to fix it. */
const FixRow = memo(function FixRow({
  line,
  words,
  actions,
}: {
  line: CheckedLine;
  signature: string;
  words: Words;
  actions: LineActions;
}) {
  return (
    <li className={cn(rowLine, "flex flex-col gap-2 px-4 py-3 md:py-2.5")}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 font-semibold text-ink-2 text-sm">
          {words.lineLabel(line)}
        </span>
        <span dir="auto" className="min-w-0 break-words font-medium">
          {line.text}
        </span>
      </span>
      <span className="flex items-start gap-1.5 font-semibold text-danger text-sm">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{words.problemOf(line)}</span>
      </span>
      <RowNotes line={line} words={words} />
      <FixButtons line={line} words={words} actions={actions} />
    </li>
  );
}, sameLine);

/** A person who will be invited: as the name and number will be saved. */
const InviteRow = memo(function InviteRow({
  line,
  words,
}: {
  line: Person;
  signature: string;
  words: Words;
}) {
  const role = words.roleOf(line);
  return (
    <PersonRow
      name={line.person.name}
      title={line.person.name}
      subtitle={
        <span dir="ltr" className="tabular-nums">
          {displayIsraeliMobile(line.person.phone)}
        </span>
      }
      trailing={
        <Badge tone={role.role === "manager" ? "accent" : "neutral"}>
          {words.labelOf(role)}
        </Badge>
      }
      below={
        <span className="flex flex-col gap-0.5">
          <span className="text-ink-2 text-sm">{words.outcomeOf(line)}</span>
          <RowNotes line={line} words={words} />
        </span>
      }
      className="md:min-h-14 md:py-2"
    />
  );
}, sameLine);

/** A line left out, and why. */
const LeftOutRow = memo(function LeftOutRow({
  line,
  words,
}: {
  line: CheckedLine;
  signature: string;
  words: Words;
}) {
  return (
    <li className={cn(rowLine, "flex flex-col gap-0.5 px-4 py-3 md:py-2.5")}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 font-semibold text-ink-2 text-sm">
          {words.lineLabel(line)}
        </span>
        <span dir="auto" className="min-w-0 break-words">
          {line.text}
        </span>
      </span>
      <span className="text-ink-2 text-sm">{words.outcomeOf(line)}</span>
    </li>
  );
}, sameLine);

/**
 * "הסרת # השורות בלי מספר נייד": a list's headings or a sheet's total take
 * no one's number, and nobody removes 20 of them one at a time. Drawn for
 * two or more.
 */
function RemoveNoPhone({
  lines,
  remove,
}: {
  lines: readonly CheckedLine[];
  remove: ((spans: LineSpan[]) => void) | null;
}) {
  const t = useTranslations("app.team.import");
  const noPhone = lines.filter(
    (line) =>
      groupOf(line) === "fix" &&
      line.kind === "problem" &&
      line.problem === "noPhone",
  );
  if (!remove || noPhone.length < 2) return null;
  return (
    <Button
      variant="secondary"
      className="self-start"
      onClick={() =>
        remove(noPhone.map((line) => ({ line: line.line, last: line.last })))
      }
    >
      {t("removeNoPhone", { count: noPhone.length })}
    </Button>
  );
}

/**
 * A phone's and a tablet's lines, in three groups: to fix, which holds the
 * import, with "הסרת # השורות בלי מספר נייד" when headings or a total
 * left several lines with no number; who will be invited; and the lines
 * left out, folded into one row until asked for.
 */
export function LineGroups({
  lines,
  words,
  actions,
  removeNoPhone,
}: {
  lines: readonly CheckedLine[];
  words: Words;
  actions: LineActions;
  /** Takes out every line with no mobile at once, given two or more. */
  removeNoPhone: ((spans: LineSpan[]) => void) | null;
}) {
  const t = useTranslations("app.team.import");
  const [open, setOpen] = useState(false);
  const fix = lines.filter((line) => groupOf(line) === "fix");
  const invite = lines.filter(
    (line): line is Person =>
      line.kind === "person" && groupOf(line) === "invite",
  );
  const leftOut = lines.filter((line) => groupOf(line) === "leftOut");
  return (
    <div className="flex flex-col gap-6">
      {fix.length > 0 ? (
        <PageSection level={3} title={t("groups.fix")}>
          <RemoveNoPhone lines={fix} remove={removeNoPhone} />
          <ol className="overflow-hidden rounded-card bg-surface shadow-card">
            {fix.map((line) => (
              <FixRow
                key={`${line.line}:${line.text}`}
                line={line}
                signature={lineSignature(line)}
                words={words}
                actions={actions}
              />
            ))}
          </ol>
        </PageSection>
      ) : null}
      {invite.length > 0 ? (
        <PageSection level={3} title={t("groups.invite")}>
          <PersonList>
            {invite.map((line) => (
              <InviteRow
                key={`${line.line}:${line.text}`}
                line={line}
                signature={lineSignature(line)}
                words={words}
              />
            ))}
          </PersonList>
        </PageSection>
      ) : null}
      {leftOut.length > 0 ? (
        <PageSection level={3} title={t("groups.leftOut")}>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors duration-150 ease-calm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
            >
              <span className="min-w-0 flex-1 text-ink">
                {t("summary.leftOutAny", { count: leftOut.length })}
              </span>
              <span className="shrink-0 font-medium text-ink-2 text-sm">
                {t(open ? "groups.hide" : "groups.show")}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-5 shrink-0 text-ink-2 transition-transform duration-200 motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </button>
            {open ? (
              <ol className="border-line border-t">
                {leftOut.map((line) => (
                  <LeftOutRow
                    key={`${line.line}:${line.text}`}
                    line={line}
                    signature={lineSignature(line)}
                    words={words}
                  />
                ))}
              </ol>
            ) : null}
          </div>
        </PageSection>
      ) : null}
    </div>
  );
}

type Filter = "all" | "fix" | "invite" | "leftOut";

/**
 * A computer's full picture: every line in one table, to fix first, then
 * the new, the updated and those left out, with a filter by group that
 * counts each. A line to fix carries its buttons in its cell.
 */
export function LinesTable({
  lines,
  words,
  actions,
  removeNoPhone,
}: {
  lines: readonly CheckedLine[];
  words: Words;
  actions: LineActions;
  removeNoPhone: ((spans: LineSpan[]) => void) | null;
}) {
  const t = useTranslations("app.team.import");
  const [filter, setFilter] = useState<Filter>("all");
  const count = (group: Exclude<Filter, "all">) =>
    lines.filter((line) => groupOf(line) === group).length;
  const shown = tableOrder(lines).filter(
    (line) => filter === "all" || groupOf(line) === filter,
  );
  const rows = shown.map((line) => {
    const person = line.kind === "person" ? line : null;
    const role = person ? words.roleOf(person) : null;
    const fixing = groupOf(line) === "fix";
    return {
      key: `${line.line}:${line.text}`,
      cells: {
        line: line.last !== undefined ? `${line.line}–${line.last}` : line.line,
        name: person ? (
          <span className="font-medium">{person.person.name}</span>
        ) : (
          <span dir="auto" className="break-words font-normal text-ink-2">
            {line.text}
          </span>
        ),
        phone: person ? (
          <span dir="ltr" className="tabular-nums">
            {displayIsraeliMobile(person.person.phone)}
          </span>
        ) : null,
        role:
          role && groupOf(line) === "invite" ? (
            <Badge tone={role.role === "manager" ? "accent" : "neutral"}>
              {words.labelOf(role)}
            </Badge>
          ) : null,
        outcome: (
          <span className="flex flex-col gap-1.5">
            <span
              className={cn(
                "text-sm",
                fixing ? "font-semibold text-danger" : "text-ink-2",
              )}
            >
              {words.outcomeOf(line)}
            </span>
            <RowNotes line={line} words={words} />
            {fixing ? (
              <FixButtons line={line} words={words} actions={actions} />
            ) : null}
          </span>
        ),
      },
    };
  });
  return (
    <div className="flex flex-col gap-3">
      <RemoveNoPhone lines={lines} remove={removeNoPhone} />
      <Segmented
        label={t("filter.label")}
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("filter.all") },
          { value: "fix", label: t("filter.fix", { count: count("fix") }) },
          {
            value: "invite",
            label: t("filter.invite", { count: count("invite") }),
          },
          {
            value: "leftOut",
            label: t("filter.leftOut", { count: count("leftOut") }),
          },
        ]}
        className="self-start"
      />
      {rows.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <DataTable
            caption={t("preview.title")}
            controls={
              rows.length > 0 && shown.some((l) => groupOf(l) === "fix")
            }
            columns={[
              { key: "line", label: t("columns.line"), numeric: true },
              { key: "name", label: t("columns.name") },
              { key: "phone", label: t("columns.phone") },
              { key: "role", label: t("columns.role") },
              { key: "outcome", label: t("columns.outcome") },
            ]}
            rows={rows}
          />
        </Card>
      ) : (
        <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
          {t("filter.none")}
        </p>
      )}
    </div>
  );
}
