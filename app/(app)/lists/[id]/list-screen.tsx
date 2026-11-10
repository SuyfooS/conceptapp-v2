"use client";

import {
  type ItemResult,
  isOutOfRange,
  type ListItem,
  listProgress,
  numberRange,
  parseReading,
  signed,
} from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChecklistItem } from "@ui/checklist-item";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ProgressRing } from "@ui/progress-ring";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextArea } from "@ui/text-field";
import { AlarmClock, CheckCheck, ChevronDown, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import type {
  ListActionResult,
  ListActions,
  ListFailure,
  ListScreenData,
} from "../list-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The words the server worked out for this list. */
export type ListScreenWords = {
  holder: string;
  due: { tone: "neutral" | "warning"; label: ReactNode } | null;
  /** Why it is only read here, or null when it is being filled. */
  readOnly: ReactNode;
  details: { key: string; label: string; value: ReactNode }[];
  timeline: { key: string; text: ReactNode }[];
};

/** A number as it is typed back into its field. */
const typed = (reading: number | null, minus: boolean) =>
  reading === null ? "" : String(minus ? Math.abs(reading) : reading);

/** The range as words: "0–5", "from 0", "up to 5" (`numberRange`). */
const rangeOf = numberRange;

/** An item whose range goes below zero needs a minus sign to be typed. */
const needsMinus = (item: ListItem) =>
  item.kind === "number" &&
  ((item.min !== null && item.min < 0) || (item.max !== null && item.max < 0));

/**
 * A list being filled. A tick saves at once and shows at once, and goes back
 * with a word if it didn't save; ticking again is the undo. A number saves on
 * leaving its field or on Enter, a note on leaving it, a comment from its
 * sheet. "Finish the list" waits for the required items; once it's finished,
 * whoever finished it can take it back for five minutes. Phone: the list and
 * the dock, the timeline folded at the end. Tablet: the items beside the
 * details and the timeline. Desktop: the same, the main action in the header,
 * and the readings as a table.
 */
export function ListScreen({
  data,
  actions,
  backHref,
  words,
}: {
  data: ListScreenData;
  actions: ListActions;
  backHref: string;
  words: ListScreenWords;
}) {
  const t = useTranslations("app.lists");
  const tl = useTranslations("app.lists.list");
  const router = useRouter();
  const { list, lookups, userId, timeZone, can } = data;
  const [items, setItems] = useState<ListItem[]>(list.items);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      list.items.map((item) => [
        item.id,
        item.kind === "number"
          ? typed(item.reading, needsMinus(item) && (item.reading ?? 0) < 0)
          : (item.answer ?? ""),
      ]),
    ),
  );
  // Minus starts on for a reading below zero, or, before one, for a range
  // wholly below zero (a freezer).
  const [minus, setMinus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      list.items
        .filter(needsMinus)
        .map((item) => [
          item.id,
          item.reading !== null
            ? item.reading < 0
            : item.max !== null && item.max < 0,
        ]),
    ),
  );
  const [failure, setFailure] = useState<{
    reason: ListFailure;
    stamp: number;
  } | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [finishing, startFinish] = useTransition();
  const [undoShown, setUndoShown] = useState(data.undoUntil !== null);
  const latest = useRef<Record<string, number>>({});

  // The undo goes away by itself when its five minutes are up, counted from
  // the server's clock (`now`): a phone whose clock is off, or the demo's
  // fixed morning, still gets the time the server gave.
  useEffect(() => {
    if (!data.undoUntil) return;
    const left = Date.parse(data.undoUntil) - Date.parse(data.now);
    const timer = setTimeout(() => setUndoShown(false), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [data.undoUntil, data.now]);

  const progress = listProgress(items);
  const fill = can.fill;

  function fail(reason: ListFailure) {
    setFailure({ reason, stamp: Date.now() });
    // Closed meanwhile, or moved on elsewhere: show where it really stands.
    if (reason === "finished" || reason === "noAccess") router.refresh();
  }

  /** What an item's result is with this change, for `set_list_item`. */
  function resultOf(
    item: ListItem,
    change: Partial<
      Pick<ListItem, "checked" | "reading" | "answer" | "comment">
    >,
  ): ItemResult {
    const next = { ...item, ...change };
    const result: NonNullable<ItemResult> = {};
    if (item.kind === "check" && next.checked) result.checked = true;
    if (item.kind === "number" && next.reading !== null) {
      result.reading = next.reading;
    }
    if (item.kind === "note" && next.answer) result.answer = next.answer;
    if (next.comment) result.comment = next.comment;
    return Object.keys(result).length > 0 ? result : null;
  }

  /** Shows the change at once, saves it, and puts it back if it didn't save. */
  async function save(
    item: ListItem,
    change: Partial<
      Pick<ListItem, "checked" | "reading" | "answer" | "comment">
    >,
  ): Promise<boolean> {
    const before = item;
    const result = resultOf(item, change);
    const next: ListItem = { ...item, ...change };
    const done =
      item.kind === "check"
        ? next.checked
        : item.kind === "number"
          ? next.reading !== null
          : item.kind === "note"
            ? next.answer !== null
            : item.done;
    // The database writes who saved it last, and when, as here.
    const shown: ListItem = {
      ...next,
      done,
      doneBy: done ? userId : null,
      doneAt: done ? new Date().toISOString() : null,
    };
    const mine = (latest.current[item.id] ?? 0) + 1;
    latest.current[item.id] = mine;
    setItems((current) => current.map((i) => (i.id === item.id ? shown : i)));
    let saved: ListActionResult<unknown>;
    try {
      saved = await actions.setItem(item.id, result);
    } catch {
      saved = { ok: false, failure: "failed" };
    }
    if (saved.ok) return true;
    // A later change to the same item has the last word.
    if (latest.current[item.id] === mine) {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? before : i)),
      );
      setDrafts((current) => ({
        ...current,
        [item.id]:
          item.kind === "number"
            ? typed(before.reading, minus[item.id] ?? false)
            : (before.answer ?? ""),
      }));
    }
    fail(saved.failure);
    return false;
  }

  function commitNumber(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    if (text === "") {
      if (item.reading !== null) void save(item, { reading: null });
      return;
    }
    const parsed = parseReading(text);
    if (parsed === null) {
      setDrafts((current) => ({
        ...current,
        [item.id]: typed(item.reading, minus[item.id] ?? false),
      }));
      fail("invalid");
      return;
    }
    const reading = minus[item.id] ? -Math.abs(parsed) : parsed;
    if (reading !== item.reading) void save(item, { reading });
  }

  function toggleMinus(item: ListItem) {
    const on = !(minus[item.id] ?? false);
    setMinus((current) => ({ ...current, [item.id]: on }));
    const parsed = parseReading(drafts[item.id] ?? "");
    if (parsed === null) return;
    const reading = on ? -Math.abs(parsed) : Math.abs(parsed);
    if (reading !== item.reading) void save(item, { reading });
  }

  function commitNote(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    const answer = text === "" ? null : text;
    if (answer !== item.answer) void save(item, { answer });
  }

  function openComment(item: ListItem) {
    setCommentDraft(item.comment ?? "");
    setCommentFor(item.id);
  }

  async function saveComment() {
    const item = items.find((i) => i.id === commentFor);
    if (!item) return;
    const text = commentDraft.trim();
    setCommentFor(null);
    const comment = text === "" ? null : text;
    if (comment !== item.comment) await save(item, { comment });
  }

  function finish() {
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.finish(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) fail(result.failure);
    });
  }

  function reopen() {
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.reopen(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) fail(result.failure);
    });
  }

  const doneLine = (item: ListItem) =>
    item.doneAt
      ? t.rich("list.doneBy", {
          name:
            (item.doneBy && lookups.people[item.doneBy]?.name) || t("noName"),
          time: timeIn(new Date(item.doneAt), timeZone),
          ltr,
        })
      : null;

  const hintOf = (item: ListItem): ReactNode => {
    const parts: ReactNode[] = [];
    if (item.hint) parts.push(item.hint);
    if (list.asksQuantities && item.requested !== null) {
      parts.push(tl("requested", { count: item.requested }));
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  const finishButton = (className?: string) => (
    <Button
      size="lg"
      loading={finishing}
      disabled={progress.requiredLeft > 0}
      onClick={finish}
      className={className}
    >
      <CheckCheck aria-hidden="true" />
      {tl("finish")}
    </Button>
  );

  const leftWords =
    progress.requiredLeft > 0
      ? tl("leftRequired", { count: progress.requiredLeft })
      : tl("readyToFinish");

  const numbers = items.filter((item) => item.kind === "number");

  const timeline = (
    <ol className="flex flex-col gap-3">
      {words.timeline.map((entry) => (
        <li key={entry.key} className="flex items-start gap-3 text-base">
          <span
            aria-hidden="true"
            className="mt-2 size-2 shrink-0 rounded-full bg-accent"
          />
          <span className="min-w-0">{entry.text}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={failure ? tl(`failed.${failure.reason}`) : null}
        stamp={failure ? String(failure.stamp) : undefined}
      />
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={list.name}
        subtitle={words.holder}
        actions={
          fill ? (
            <div className="hidden xl:flex">{finishButton()}</div>
          ) : can.reopen && !undoShown ? (
            <Button
              variant="secondary"
              size="lg"
              loading={finishing}
              onClick={reopen}
            >
              <RotateCcw aria-hidden="true" />
              {tl("reopen")}
            </Button>
          ) : null
        }
      />

      {undoShown && list.status !== "open" ? (
        <UndoRow
          message={
            list.status === "cancelled" ? tl("cancelled") : tl("finished")
          }
          onUndo={reopen}
          pending={finishing}
        />
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label={tl("progressLabel")}>
            <Card tone="hero" padding="lg" className="flex items-center gap-5">
              <span className="relative grid shrink-0 place-items-center">
                <ProgressRing
                  value={progress.done}
                  max={progress.total}
                  tone="hero"
                  className="size-20"
                />
                <span
                  aria-hidden="true"
                  className="absolute font-bold text-lg tabular-nums"
                >
                  <span dir="ltr">
                    {progress.done}/{progress.total}
                  </span>
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold text-xl">
                  {t("card.progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </span>
                <span className="text-base">
                  {list.status === "open" ? leftWords : words.readOnly}
                </span>
                {words.due ? (
                  // Near or late, a clock says so beside the words, which
                  // carry it; warning colours don't read on the accent.
                  <span className="mt-1 inline-flex min-h-[30px] w-fit items-center gap-1.5 rounded-full bg-accent-press px-3 font-semibold text-sm shadow-[inset_0_0.5px_0_var(--glass-sheen)]">
                    {words.due.tone === "warning" ? (
                      <AlarmClock
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    ) : null}
                    <span>{words.due.label}</span>
                  </span>
                ) : null}
              </span>
            </Card>
          </section>

          {list.note ? (
            <Card tone="flat" padding="lg" className="whitespace-pre-line">
              <span className="sr-only">{tl("note")}: </span>
              {list.note}
            </Card>
          ) : null}

          {words.readOnly && list.status === "open" ? (
            <p className="px-1 text-ink-2">{words.readOnly}</p>
          ) : null}

          <PageSection title={tl("items")}>
            <ListGroup>
              {items.map((item) => {
                const range = rangeOf(item);
                const out = isOutOfRange(item);
                const minusOf = needsMinus(item)
                  ? {
                      label: tl("minus"),
                      on: minus[item.id] ?? false,
                      onToggle: () => toggleMinus(item),
                    }
                  : null;
                return (
                  <ChecklistItem
                    key={item.id}
                    kind={item.kind}
                    label={item.label}
                    hint={hintOf(item)}
                    required={item.required}
                    optionalLabel={tl("optional")}
                    done={item.done}
                    doneLine={doneLine(item)}
                    comment={item.comment}
                    readOnly={!fill}
                    commentAction={
                      fill && item.kind !== "note"
                        ? {
                            label: item.comment
                              ? tl("comment.edit")
                              : tl("comment.add"),
                            onClick: () => openComment(item),
                          }
                        : null
                    }
                    check={
                      item.kind === "check"
                        ? {
                            checked: item.done,
                            onToggle: () =>
                              void save(item, { checked: !item.done }),
                          }
                        : undefined
                    }
                    number={
                      item.kind === "number"
                        ? {
                            // Read-only, the minus toggle isn't there to say
                            // the sign, so the reading carries its own.
                            value: fill
                              ? (drafts[item.id] ?? "")
                              : typed(item.reading, false),
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNumber(item),
                            fieldLabel: tl("readingOf", { label: item.label }),
                            unit: item.unit,
                            range: range
                              ? t.rich(`list.range.${range.kind}`, {
                                  range: range.range,
                                  ltr,
                                })
                              : null,
                            outOfRange:
                              out && range
                                ? t.rich("list.outOfRange", {
                                    range: range.range,
                                    ltr,
                                  })
                                : null,
                            minus: fill ? minusOf : null,
                          }
                        : undefined
                    }
                    note={
                      item.kind === "note"
                        ? {
                            value: drafts[item.id] ?? "",
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNote(item),
                            fieldLabel: item.label,
                            placeholder: tl("answerPlaceholder"),
                          }
                        : undefined
                    }
                    photo={
                      item.kind === "photo"
                        ? { text: tl("photoLater") }
                        : undefined
                    }
                  />
                );
              })}
            </ListGroup>
          </PageSection>

          {/* Desktop: the readings at a glance, out of range flagged. */}
          {numbers.length > 0 ? (
            <PageSection
              title={tl("readings.title")}
              className="hidden xl:flex"
            >
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                <table className="w-full border-collapse text-base">
                  <caption className="sr-only">{tl("readings.title")}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.item")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.reading")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.range")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.who")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.when")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.map((item) => {
                      const range = rangeOf(item);
                      // Who read it and when: whoever saved it last.
                      const readAt = item.reading !== null ? item.doneAt : null;
                      return (
                        <tr key={item.id}>
                          <td className="border-line border-t px-4 py-3">
                            {item.label}
                          </td>
                          <td className="border-line border-t px-4 py-3">
                            {item.reading === null ? (
                              <span className="text-ink-2">—</span>
                            ) : isOutOfRange(item) ? (
                              <Badge tone="warning">
                                <span dir="ltr">
                                  {signed(item.reading)}
                                  {item.unit ? ` ${item.unit}` : ""}
                                </span>
                              </Badge>
                            ) : (
                              <span dir="ltr">
                                {signed(item.reading)}
                                {item.unit ? ` ${item.unit}` : ""}
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "border-line border-t px-4 py-3 text-ink-2",
                            )}
                          >
                            {range ? <span dir="ltr">{range.range}</span> : "—"}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {readAt
                              ? (item.doneBy &&
                                  lookups.people[item.doneBy]?.name) ||
                                t("noName")
                              : "—"}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {readAt ? (
                              <span dir="ltr">
                                {timeIn(new Date(readAt), timeZone)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>
          ) : null}
        </div>

        <aside
          aria-label={tl("details.title")}
          className="flex min-w-0 flex-col gap-6"
        >
          <Card tone="flat" padding="lg" className="hidden md:block">
            <dl className="flex flex-col gap-3">
              {words.details.map((detail) => (
                <div key={detail.key} className="flex flex-col gap-0.5">
                  <dt className="text-ink-2 text-sm">{detail.label}</dt>
                  <dd className="text-base">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Phone: what happened, folded at the end. */}
          <details className="group md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {tl("timeline.title")}
              <ChevronDown
                aria-hidden="true"
                className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <Card tone="flat" padding="lg" className="mt-3">
              {timeline}
            </Card>
          </details>
          <PageSection title={tl("timeline.title")} className="hidden md:flex">
            <Card tone="flat" padding="lg">
              {timeline}
            </Card>
          </PageSection>
        </aside>
      </div>

      {fill ? (
        <div className="xl:hidden">
          <div aria-hidden="true" className="h-36" />
          <FloatingDock
            notice={
              <p className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base">
                {leftWords}
              </p>
            }
          >
            <DockButton
              icon={<CheckCheck />}
              loading={finishing}
              disabled={progress.requiredLeft > 0}
              onClick={finish}
            >
              {tl("finish")}
            </DockButton>
          </FloatingDock>
        </div>
      ) : null}

      <Sheet
        open={commentFor !== null}
        onOpenChange={(open) => {
          if (!open) setCommentFor(null);
        }}
        title={tl("comment.title")}
        subtitle={items.find((item) => item.id === commentFor)?.label}
        closeLabel={tl("comment.close")}
        action={{
          label: tl("comment.save"),
          onClick: () => void saveComment(),
        }}
      >
        <div className="px-2 pt-1 pb-2">
          <TextArea
            label={tl("comment.label")}
            value={commentDraft}
            maxLength={200}
            rows={3}
            onChange={(event) => setCommentDraft(event.target.value)}
          />
        </div>
      </Sheet>
    </PageBody>
  );
}
