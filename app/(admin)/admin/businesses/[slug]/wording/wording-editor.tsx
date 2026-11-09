"use client";

import {
  keptParts,
  searchable,
  sentenceFits,
  shownSentence,
  WORDING_GROUPS,
  WORDING_MAX,
  type WordingEntry,
  type WordingGroup,
  wordingGroupOf,
} from "@domain/wording";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextArea, TextField } from "@ui/text-field";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { SaveWording, WordingProblem } from "./wording-types";

/** How many matches a search shows at once. */
const RESULTS = 40;

/**
 * Every sentence a business sees, to replace with its own (Orel, 7 November
 * 2026). The sentences the business already changed come first, then role,
 * module and tab names, then each screen's, each group opened on demand. A
 * search finds a sentence by its words, without slashes or geresh. Each row
 * says where the sentence lives, since the same words appear on several
 * screens. A sentence opens in a sheet with the app's and the template's
 * beside it, and what it must keep. A change can be undone from the line
 * that follows it.
 */
export function WordingEditor({
  entries: initial,
  save,
}: {
  entries: WordingEntry[];
  /** `saveBusinessWordingAction` bound to the business, or the demo's. */
  save: SaveWording;
}) {
  const t = useTranslations("admin.wording");
  const [entries, setEntries] = useState(initial);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<WordingGroup>>(
    () => new Set(["common"]),
  );
  const [editing, setEditing] = useState<WordingEntry | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    stamp: number;
    undo: { key: string; sentence: string | null } | null;
  } | null>(null);
  const [undoing, startUndo] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  // The row a sheet was opened from, and where focus goes once it closes:
  // the sheet has no trigger of its own to give focus back to.
  const opener = useRef<HTMLElement | null>(null);
  const focusAfter = useRef<"row" | "undo" | null>(null);
  // An undo takes its line away, and the focus with it: back to the search.
  const focusSearch = useRef(false);

  useEffect(() => {
    if (!toast || !focusSearch.current) return;
    focusSearch.current = false;
    root.current?.querySelector<HTMLElement>("input[type=search]")?.focus();
  }, [toast]);

  useEffect(() => {
    if (editing !== null || focusAfter.current === null) return;
    const to = focusAfter.current;
    const back = opener.current;
    focusAfter.current = null;
    opener.current = null;
    // After the sheet's own focus handling, which runs on a timeout too.
    const timer = setTimeout(() => {
      const scope = root.current;
      const undoButton =
        to === "undo"
          ? scope?.querySelector<HTMLElement>("[data-wording-undo]")
          : null;
      const target =
        undoButton ??
        (back?.isConnected
          ? back
          : scope?.querySelector<HTMLElement>("input[type=search]"));
      target?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [editing]);

  const byGroup = useMemo(() => {
    const groups = new Map<WordingGroup, WordingEntry[]>();
    for (const entry of entries) {
      const group = wordingGroupOf(entry.key);
      groups.set(group, [...(groups.get(group) ?? []), entry]);
    }
    return groups;
  }, [entries]);
  const changed = entries.filter((e) => e.business !== null);
  const needle = searchable(query);
  const found = needle
    ? entries.filter((e) =>
        [e.app, e.template ?? "", e.business ?? ""].some((s) =>
          searchable(s).includes(needle),
        ),
      )
    : [];

  function applied(key: string, sentence: string | null) {
    setEntries((all) =>
      all.map((e) => (e.key === key ? { ...e, business: sentence } : e)),
    );
  }

  function undo(key: string, sentence: string | null) {
    startUndo(async () => {
      let result: Awaited<ReturnType<SaveWording>>;
      try {
        result = await save(key, sentence);
      } catch {
        result = { ok: false, problem: "failed" };
      }
      if (!result.ok) {
        // The line stays, saying what went wrong, to try again from.
        const problem = result.problem;
        setToast((now) => ({
          message: t(`errors.${problem}`, { list: "-" }),
          stamp: (now?.stamp ?? 0) + 1,
          undo: now?.undo ?? null,
        }));
        return;
      }
      applied(key, result.sentence);
      focusSearch.current = true;
      setToast((now) => ({
        message: t("restored"),
        stamp: (now?.stamp ?? 0) + 1,
        undo: null,
      }));
    });
  }

  const rows = (list: WordingEntry[], withGroup: boolean) => (
    <ListGroup>
      {list.map((entry) => (
        <SentenceRow
          key={entry.key}
          entry={entry}
          withGroup={withGroup}
          onOpen={(row) => {
            opener.current = row;
            setEditing(entry);
          }}
        />
      ))}
    </ListGroup>
  );

  return (
    <div ref={root} className="flex flex-col gap-6 md:max-w-3xl">
      <div className="flex flex-col gap-1.5">
        <TextField
          type="search"
          label={t("search")}
          hint={t("searchHint")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>

      {/* The last change, until the next one: undone in one press. */}
      {toast?.undo ? (
        <div className="flex items-center justify-between gap-3 rounded-card bg-surface-2 ps-4 pe-1 py-1">
          <span className="text-ink-2">{toast.message}</span>
          <Button
            variant="ghost"
            loading={undoing}
            data-wording-undo=""
            onClick={() => {
              const target = toast.undo;
              if (target) undo(target.key, target.sentence);
            }}
          >
            {t("undo")}
          </Button>
        </div>
      ) : null}

      {needle ? (
        <PageSection
          title={t("results", { count: found.length })}
          action={<Search aria-hidden="true" className="size-5 text-ink-2" />}
        >
          {found.length > 0 ? rows(found.slice(0, RESULTS), true) : null}
          {found.length > RESULTS ? (
            <p className="px-1 text-ink-2 text-sm">
              {t("more", { count: found.length - RESULTS })}
            </p>
          ) : null}
        </PageSection>
      ) : (
        <>
          {changed.length > 0 ? (
            <PageSection
              title={t("changed")}
              action={
                <span className="text-ink-2 text-sm">
                  {t("count", { count: changed.length })}
                </span>
              }
            >
              {rows(changed, true)}
            </PageSection>
          ) : null}
          {WORDING_GROUPS.map((group) => {
            const list = byGroup.get(group) ?? [];
            if (list.length === 0) return null;
            const open = openGroups.has(group);
            return (
              <PageSection
                key={group}
                title={t(`groups.${group}`)}
                action={
                  <span className="text-ink-2 text-sm">
                    {t("count", { count: list.length })}
                  </span>
                }
              >
                {open ? rows(list, false) : null}
                <Button
                  variant="ghost"
                  className="self-start"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenGroups((now) => {
                      const next = new Set(now);
                      if (open) next.delete(group);
                      else next.add(group);
                      return next;
                    })
                  }
                >
                  {open ? t("showLess") : t("showAll")}
                </Button>
              </PageSection>
            );
          })}
        </>
      )}

      {editing ? (
        <EditSheet
          entry={editing}
          save={save}
          onClose={() => {
            focusAfter.current = "row";
            setEditing(null);
          }}
          onSaved={(sentence, previous) => {
            applied(editing.key, sentence);
            // A stored sentence that no longer fits never showed: undoing
            // brings back what did, the template's or the app's.
            const before =
              previous !== null && sentenceFits(editing.app, previous)
                ? previous
                : null;
            focusAfter.current = before === sentence ? "row" : "undo";
            setEditing(null);
            setToast((now) => ({
              message: t("saved"),
              stamp: (now?.stamp ?? 0) + 1,
              undo:
                before === sentence
                  ? null
                  : { key: editing.key, sentence: before },
            }));
          }}
        />
      ) : null}

      <StatusToast
        message={toast?.message ?? null}
        stamp={String(toast?.stamp ?? 0)}
      />
    </div>
  );
}

/**
 * One sentence as the business shows it, with where it comes from and where
 * it lives: its key, and its group where the list mixes groups.
 */
function SentenceRow({
  entry,
  withGroup,
  onOpen,
}: {
  entry: WordingEntry;
  withGroup: boolean;
  onOpen: (row: HTMLElement) => void;
}) {
  const t = useTranslations("admin.wording");
  const { sentence, source } = shownSentence(entry);
  return (
    <ListRow
      onClick={(event) => onOpen(event.currentTarget)}
      title={<span className="break-words">{sentence}</span>}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {source === "app" ? (
            <span>{t("source.app")}</span>
          ) : (
            <Badge tone={source === "business" ? "accent" : "neutral"}>
              {t(`source.${source}`)}
            </Badge>
          )}
          {withGroup ? (
            <span>{t(`groups.${wordingGroupOf(entry.key)}`)}</span>
          ) : null}
          <span dir="ltr" className="break-all">
            {entry.key}
          </span>
        </span>
      }
    />
  );
}

/** Editing one sentence, with the app's and the template's beside it. */
function EditSheet({
  entry,
  save,
  onClose,
  onSaved,
}: {
  entry: WordingEntry;
  save: SaveWording;
  onClose: () => void;
  onSaved: (sentence: string | null, previous: string | null) => void;
}) {
  const t = useTranslations("admin.wording");
  const shown = shownSentence(entry).sentence;
  const [draft, setDraft] = useState(shown);
  const [problem, setProblem] = useState<WordingProblem | null>(null);
  const [pending, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const keep = keptParts(entry.app).join(" ");
  // What the business shows without a sentence of its own.
  const below = entry.template ?? entry.app;
  const unchanged = draft.trim() === shown;

  // A refused sentence: back to the field, which reads out what is wrong.
  useEffect(() => {
    if (problem) field.current?.focus();
  }, [problem]);

  function submit(sentence: string | null) {
    setProblem(null);
    start(async () => {
      let result: Awaited<ReturnType<SaveWording>>;
      try {
        result = await save(entry.key, sentence);
      } catch {
        result = { ok: false, problem: "failed" };
      }
      if (result.ok) onSaved(result.sentence, result.previous);
      else setProblem(result.problem);
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("sheet.title")}
      closeLabel={t("sheet.close")}
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink-2 text-sm">
          {t(`groups.${wordingGroupOf(entry.key)}`)}
          {" · "}
          <span dir="ltr" className="break-all">
            {entry.key}
          </span>
        </p>
        <Quote label={t("sheet.app")} text={entry.app} />
        {entry.template !== null ? (
          <Quote label={t("sheet.template")} text={entry.template} />
        ) : null}
        <TextArea
          ref={field}
          label={t("sheet.field")}
          value={draft}
          rows={3}
          maxLength={WORDING_MAX}
          onChange={(event) => setDraft(event.target.value)}
          hint={keep ? t("sheet.keep", { list: keep }) : undefined}
          error={
            problem ? t(`errors.${problem}`, { list: keep || "-" }) : undefined
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button
            loading={pending}
            disabled={unchanged}
            // The sentence it would show anyway clears its own, so the
            // template's later changes still reach it.
            onClick={() => submit(draft.trim() === below ? null : draft)}
          >
            {t("sheet.save")}
          </Button>
          {entry.business !== null ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => submit(null)}
            >
              {entry.template !== null
                ? t("sheet.toTemplate")
                : t("sheet.toApp")}
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-ink-2 text-sm">{label}</span>
      <p className="break-words rounded-control bg-surface-2 px-3 py-2">
        {text}
      </p>
    </div>
  );
}
