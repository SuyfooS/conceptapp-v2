"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { floatingButtonClass } from "@ui/floating-action";
import { IconButton } from "@ui/icon-button";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { TextArea, TextField } from "@ui/text-field";
import {
  Hourglass,
  Send,
  StickyNote,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { changeLine } from "../../../changes";
import { useOrderDemo } from "../../../demo-store";
import {
  chosenOptions,
  type DraftLine,
  draftCount,
  itemById,
  routeCounts,
  unitPrice,
} from "../../../model";
import { departmentName, Price, useOrderWords } from "../../../parts";

/** A note or an allergy at most this long, as a ticket's line holds it. */
const NOTE_MAX = 120;

/** Where the draft's items go: "מטבח · 3, בר · 1". */
export function useRoutes(placeId: string) {
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  return routeCounts(data.menu, data.drafts[placeId] ?? [])
    .map(({ department, count }) =>
      t("send.route", { department: departmentName(department), count }),
    )
    .join(", ");
}

/**
 * The screen's one main action: "שליחת ההזמנה" with the count beside it,
 * and under it where the items go. On a phone it floats above the tab bar.
 */
export function SendButton({
  placeId,
  onSend,
  floating = false,
}: {
  placeId: string;
  onSend: () => void;
  floating?: boolean;
}) {
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const routes = useRoutes(placeId);
  const count = draftCount(data.drafts[placeId] ?? []);
  return (
    <Button
      size="lg"
      onClick={onSend}
      className={cn(
        "w-full flex-col gap-0 py-2",
        floating && floatingButtonClass,
      )}
    >
      <span className="flex items-center gap-2">
        <Send aria-hidden="true" />
        {t("send.label")}
        <span className="font-medium text-base">
          {t("send.count", { count })}
        </span>
      </span>
      <span className="font-medium text-sm">{routes}</span>
    </Button>
  );
}

/**
 * The draft (§3.2 step 3): what was chosen and not sent yet, each line with
 * how many, and its "הערה", "אלרגיה" and "לחכות עם זה" in sight, with no
 * long press. Removing a line comes back from the toast.
 */
export function DraftPanel({
  placeId,
  headingRef,
  onNote,
  onRemove,
  send,
}: {
  placeId: string;
  headingRef: Ref<HTMLHeadingElement>;
  onNote: (line: DraftLine, kind: "note" | "allergy") => void;
  onRemove: (line: DraftLine, index: number) => void;
  /** The send button, where it sits from tablet up. */
  send: ReactNode;
}) {
  const { t } = useOrderWords();
  const { data, update } = useOrderDemo();
  const lines = data.drafts[placeId] ?? [];
  const routes = useRoutes(placeId);
  return (
    <PageSection title={t("draft.title")} headingRef={headingRef}>
      {lines.length === 0 ? (
        <Card padding="lg">
          <p className="text-ink-2">{t("draft.empty")}</p>
        </Card>
      ) : (
        <>
          <p className="-mt-1 px-1 text-ink-2 text-sm">
            {t("draft.goes", { routes })}
          </p>
          <ul className="overflow-hidden rounded-card bg-surface shadow-card">
            {lines.map((line, index) => {
              const item = itemById(data.menu, line.itemId);
              if (!item) return null;
              const choices = chosenOptions(item, line.choices)
                .map((option) => option.name)
                .join(" · ");
              return (
                <li
                  key={line.id}
                  className="relative flex flex-col gap-2 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{item.name}</span>
                      {choices ? (
                        <span className="text-ink-2 text-sm">{choices}</span>
                      ) : null}
                      <span className="text-ink-2 text-sm">
                        <Price agorot={unitPrice(item, line.choices)} />
                      </span>
                    </span>
                    <Stepper
                      value={String(line.qty)}
                      onValueChange={(value) => {
                        const qty = Number(value);
                        if (Number.isInteger(qty) && qty >= 1 && qty <= 99) {
                          update((d) =>
                            changeLine(d, placeId, line.id, { qty }),
                          );
                        }
                      }}
                      min={1}
                      max={99}
                      label={t("draft.qty", { name: item.name })}
                      decreaseLabel={t("draft.less", { name: item.name })}
                      increaseLabel={t("draft.more", { name: item.name })}
                    />
                  </div>
                  {line.allergy ? (
                    <p className="flex items-start gap-1.5 font-semibold text-danger">
                      <TriangleAlert
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0"
                      />
                      {t("line.allergy", { allergy: line.allergy })}
                    </p>
                  ) : null}
                  {line.note ? (
                    <p className="rounded-control bg-warning-soft px-3 py-1.5">
                      {t("line.note", { note: line.note })}
                    </p>
                  ) : null}
                  {line.held ? (
                    <Badge className="self-start">{t("draft.heldBadge")}</Badge>
                  ) : null}
                  <div className="-ms-2 flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      className="px-3"
                      onClick={() => onNote(line, "note")}
                    >
                      <StickyNote aria-hidden="true" />
                      {t("draft.note")}
                      <span className="sr-only">
                        {t("draft.forItem", { name: item.name })}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-3"
                      onClick={() => onNote(line, "allergy")}
                    >
                      <TriangleAlert aria-hidden="true" />
                      {t("draft.allergy")}
                      <span className="sr-only">
                        {t("draft.forItem", { name: item.name })}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className={cn("px-3", line.held && "bg-surface-2")}
                      aria-pressed={line.held}
                      onClick={() =>
                        update((d) =>
                          changeLine(d, placeId, line.id, { held: !line.held }),
                        )
                      }
                    >
                      <Hourglass aria-hidden="true" />
                      {t("draft.hold")}
                      <span className="sr-only">
                        {t("draft.forItem", { name: item.name })}
                      </span>
                    </Button>
                    <IconButton
                      label={t("draft.remove", { name: item.name })}
                      icon={<Trash2 />}
                      className="ms-auto"
                      onClick={() => onRemove(line, index)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {send}
        </>
      )}
    </PageSection>
  );
}

/**
 * A line's note or allergy, in a sheet. An allergy needs its words, which
 * the kitchen sees in danger with the word "אלרגיה"; a note is for how to
 * make it, never a customer's name.
 */
export function NoteSheet({
  placeId,
  target,
  onClose,
  onSaved,
}: {
  placeId: string;
  target: { line: DraftLine; kind: "note" | "allergy" } | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const item = target ? itemById(data.menu, target.line.itemId) : undefined;
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        target
          ? t(target.kind === "note" ? "note.noteTitle" : "note.allergyTitle", {
              name: item?.name ?? "",
            })
          : ""
      }
      closeLabel={t("sheet.close")}
    >
      {target ? (
        <NoteForm
          key={`${target.line.id}-${target.kind}`}
          placeId={placeId}
          line={target.line}
          kind={target.kind}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  );
}

function NoteForm({
  placeId,
  line,
  kind,
  onSaved,
}: {
  placeId: string;
  line: DraftLine;
  kind: "note" | "allergy";
  onSaved: (text: string) => void;
}) {
  const { t } = useOrderWords();
  const { update } = useOrderDemo();
  const noteField = useRef<HTMLTextAreaElement>(null);
  const allergyField = useRef<HTMLInputElement>(null);
  const field = () => noteField.current ?? allergyField.current;
  const was = kind === "note" ? line.note : line.allergy;
  const [text, setText] = useState(was ?? "");
  const [missing, setMissing] = useState(false);

  // The words are the one thing to write here: the field has the focus.
  useEffect(() => {
    (noteField.current ?? allergyField.current)?.focus({ preventScroll: true });
  }, []);

  function save(value: string | null) {
    const words = value?.trim() ?? "";
    if (kind === "allergy" && value !== null && !words) {
      setMissing(true);
      field()?.focus();
      return;
    }
    const kept = words ? words : null;
    update((d) =>
      changeLine(
        d,
        placeId,
        line.id,
        kind === "note" ? { note: kept } : { allergy: kept },
      ),
    );
    onSaved(words);
  }

  return (
    <div className="flex flex-col gap-3 px-2 pt-1">
      {kind === "note" ? (
        <TextArea
          ref={noteField}
          label={t("note.noteLabel")}
          placeholder={t("note.notePlaceholder")}
          hint={t("note.noteHint")}
          rows={3}
          maxLength={NOTE_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <TextField
          ref={allergyField}
          label={t("note.allergyLabel")}
          placeholder={t("note.allergyPlaceholder")}
          hint={t("note.allergyHint")}
          error={missing ? t("note.allergyMissing") : undefined}
          maxLength={NOTE_MAX}
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (missing) setMissing(false);
          }}
        />
      )}
      <Button size="lg" onClick={() => save(text)}>
        {t(kind === "note" ? "note.saveNote" : "note.saveAllergy")}
      </Button>
      {was ? (
        <Button variant="ghost" onClick={() => save(null)}>
          {t(kind === "note" ? "note.removeNote" : "note.removeAllergy")}
        </Button>
      ) : null}
    </div>
  );
}
