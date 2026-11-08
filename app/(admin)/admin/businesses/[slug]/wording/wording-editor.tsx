"use client";

import {
  placeholdersOf,
  searchable,
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
import { useMemo, useState, useTransition } from "react";
import type { SaveWording, WordingProblem } from "./wording-types";

/** How many matches a search shows at once. */
const RESULTS = 40;

/**
 * Every sentence a business sees, to replace with its own (Orel, 7 November
 * 2026). The sentences the business already changed come first, then role,
 * module and tab names, then each screen's, each group opened on demand. A
 * search finds a sentence by its words, without slashes or geresh. A
 * sentence opens in a sheet with the app's and the template's beside it, and
 * what it must keep. A change can be undone from the toast's line.
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

  async function undo(key: string, sentence: string | null) {
    const result = await save(key, sentence);
    if (!result.ok) return;
    applied(key, sentence);
    setToast((now) => ({
      message: t("restored"),
      stamp: (now?.stamp ?? 0) + 1,
      undo: null,
    }));
  }

  const rows = (list: WordingEntry[]) => (
    <ListGroup>
      {list.map((entry) => (
        <SentenceRow
          key={entry.key}
          entry={entry}
          onOpen={() => setEditing(entry)}
        />
      ))}
    </ListGroup>
  );

  return (
    <div className="flex flex-col gap-6 md:max-w-3xl">
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
            onClick={() => {
              const target = toast.undo;
              if (target) void undo(target.key, target.sentence);
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
          {found.length > 0 ? rows(found.slice(0, RESULTS)) : null}
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
              {rows(changed)}
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
                {open ? rows(list) : null}
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
          onClose={() => setEditing(null)}
          onSaved={(sentence, previous) => {
            applied(editing.key, sentence);
            setEditing(null);
            setToast((now) => ({
              message: t("saved"),
              stamp: (now?.stamp ?? 0) + 1,
              undo: { key: editing.key, sentence: previous },
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

/** One sentence as the business shows it, with where it comes from. */
function SentenceRow({
  entry,
  onOpen,
}: {
  entry: WordingEntry;
  onOpen: () => void;
}) {
  const t = useTranslations("admin.wording");
  const { sentence, source } = shownSentence(entry);
  return (
    <ListRow
      onClick={onOpen}
      title={<span className="break-words">{sentence}</span>}
      subtitle={
        source === "app" ? (
          t("source.app")
        ) : (
          <Badge tone={source === "business" ? "accent" : "neutral"}>
            {t(`source.${source}`)}
          </Badge>
        )
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
  const [draft, setDraft] = useState(shownSentence(entry).sentence);
  const [problem, setProblem] = useState<WordingProblem | null>(null);
  const [pending, start] = useTransition();
  const { args, tags } = placeholdersOf(entry.app);
  const keep = [
    ...args.map((a) => `{${a.slice(1, -1).split(",")[0]}}`),
    ...new Set(tags.filter((tag) => !tag.startsWith("</"))),
  ].join(" ");

  function submit(sentence: string | null) {
    setProblem(null);
    start(async () => {
      let result: Awaited<ReturnType<SaveWording>>;
      try {
        result = await save(entry.key, sentence);
      } catch {
        result = { ok: false, problem: "failed" };
      }
      if (result.ok) onSaved(sentence, result.previous);
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
        <Quote label={t("sheet.app")} text={entry.app} />
        {entry.template !== null ? (
          <Quote label={t("sheet.template")} text={entry.template} />
        ) : null}
        <TextArea
          label={t("sheet.field")}
          value={draft}
          rows={3}
          maxLength={WORDING_MAX}
          onChange={(event) => setDraft(event.target.value)}
          hint={keep ? t("sheet.keep", { list: keep }) : undefined}
          error={
            problem ? t(`errors.${problem}`, { list: keep || "-" }) : undefined
          }
          dir="auto"
        />
        <div className="flex flex-wrap gap-2">
          <Button loading={pending} onClick={() => submit(draft)}>
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
