"use client";

import { changeDraftLine, type DraftLine } from "@domain/order-screens";
import type { Menu } from "@domain/order-taking";
import { ORDER_CAPS } from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { FieldRow } from "@ui/field-row";
import { DraftLineRow } from "@ui/order-draft";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { TextArea } from "@ui/text-field";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useOrdersMode } from "./orders-mode";
import { Price, useOrderWords } from "./orders-parts";

/** A line's unit price with its chosen options', as the send freezes it. */
function unitOf(menu: Menu | null, line: DraftLine): number {
  const item = menu?.items.find((i) => i.id === line.item);
  if (!item) return 0;
  return line.choices.reduce((sum, choice) => {
    const option = item.optionGroups
      .find((group) => group.id === choice.group)
      ?.options.find((o) => o.id === choice.option);
    return sum + (option?.priceAgorot ?? 0);
  }, item.priceAgorot);
}

/** The chosen options by name, in the item's order. */
function choiceNames(menu: Menu | null, line: DraftLine): string[] {
  const item = menu?.items.find((i) => i.id === line.item);
  if (!item) return [];
  return item.optionGroups.flatMap((group) =>
    group.options
      .filter((o) =>
        line.choices.some((c) => c.group === group.id && c.option === o.id),
      )
      .map((o) => o.name),
  );
}

/**
 * The draft (the design's §3.2 step 3): what was chosen and not sent yet,
 * each line with how many, its note or allergy in sight, and "הערה",
 * "אלרגיה" and "לחכות עם זה" with no long press. One sheet for the note,
 * with an "אלרגיה" switch (default 1): an allergy needs its words.
 */
export function DraftPanel({
  draft,
  menu,
  routes,
  headingRef,
  onRemove,
  onNoteRemoved,
  marked = null,
  send,
}: {
  draft: string;
  menu: Menu | null;
  /** Where its items go, in words. */
  routes: string;
  headingRef: Ref<HTMLHeadingElement>;
  onRemove: (line: DraftLine, index: number) => void;
  /** A note taken off, for its undo. */
  onNoteRemoved: (line: DraftLine) => void;
  /**
   * The items a refusal names, by id, and the word it marks their lines
   * with: "נגמר" for what sold out meanwhile, "אין מחלקה שמכינה" for what no
   * department prepares.
   */
  marked?: { items: readonly string[]; word: string } | null;
  /** The send, where it sits from tablet up. */
  send: ReactNode;
}) {
  const { t } = useOrderWords();
  const { drafts, frame } = useOrdersMode();
  const lines = drafts.get(draft);
  const [noteFor, setNoteFor] = useState<{
    line: DraftLine;
    allergy: boolean;
  } | null>(null);
  const nameOf = (line: DraftLine) =>
    menu?.items.find((item) => item.id === line.item)?.name ?? "";
  const change = (id: string, patch: Parameters<typeof changeDraftLine>[2]) =>
    drafts.set(draft, changeDraftLine(drafts.get(draft), id, patch));

  return (
    <PageSection title={t("draft.title")} headingRef={headingRef}>
      {lines.length === 0 ? (
        <Card padding="lg">
          <p className="text-ink-2">{t("draft.empty")}</p>
        </Card>
      ) : (
        <>
          {routes ? (
            <p className="-mt-1 px-1 text-ink-2 text-sm">
              {t("draft.goes", { routes })}
            </p>
          ) : null}
          <ul className="overflow-hidden rounded-card bg-surface shadow-card">
            {lines.map((line, index) => {
              const name = nameOf(line);
              const forItem = t("draft.forItem", { name });
              return (
                <DraftLineRow
                  key={line.id}
                  name={name}
                  choices={choiceNames(menu, line)}
                  price={<Price agorot={unitOf(menu, line)} />}
                  quantity={line.quantity}
                  onQuantity={(quantity) => change(line.id, { quantity })}
                  quantityLabels={{
                    label: t("draft.qty", { name }),
                    less: t("draft.less", { name }),
                    more: t("draft.more", { name }),
                  }}
                  note={
                    line.note && !line.allergy
                      ? t("line.note", { note: line.note })
                      : null
                  }
                  mark={marked?.items.includes(line.item) ? marked.word : null}
                  allergy={
                    line.note && line.allergy
                      ? t("line.allergy", { note: line.note })
                      : null
                  }
                  held={line.held ? t("draft.heldBadge") : null}
                  noteButton={{
                    label: t("draft.note"),
                    forItem,
                    onClick: () => setNoteFor({ line, allergy: line.allergy }),
                  }}
                  allergyButton={{
                    label: t("draft.allergy"),
                    forItem,
                    onClick: () => setNoteFor({ line, allergy: true }),
                  }}
                  holdButton={{
                    label: t("draft.hold"),
                    forItem,
                    pressed: line.held,
                    onClick: () => change(line.id, { held: !line.held }),
                  }}
                  remove={{
                    label: t("draft.remove", { name }),
                    onClick: () => onRemove(line, index),
                  }}
                  disabled={frame.viewing}
                />
              );
            })}
          </ul>
          {send}
        </>
      )}
      <Sheet
        open={noteFor !== null}
        onOpenChange={(open) => {
          if (!open) setNoteFor(null);
        }}
        title={noteFor ? t("note.title", { name: nameOf(noteFor.line) }) : ""}
        closeLabel={t("note.close")}
      >
        {noteFor ? (
          <NoteForm
            key={`${noteFor.line.id}-${noteFor.allergy}`}
            line={noteFor.line}
            allergy={noteFor.allergy}
            onSave={(note, allergy) => {
              setNoteFor(null);
              change(noteFor.line.id, {
                note,
                allergy: note ? allergy : false,
              });
              if (!note && noteFor.line.note) onNoteRemoved(noteFor.line);
            }}
          />
        ) : null}
      </Sheet>
    </PageSection>
  );
}

/**
 * A line's one note, in a sheet: how to make it, never a customer's name;
 * with "אלרגיה" on, what to avoid, which whoever prepares it sees in danger
 * with the word. An allergy needs its words.
 */
function NoteForm({
  line,
  allergy: startsAllergy,
  onSave,
}: {
  line: DraftLine;
  allergy: boolean;
  onSave: (note: string | null, allergy: boolean) => void;
}) {
  const { t } = useOrderWords();
  const field = useRef<HTMLTextAreaElement>(null);
  const switchId = useId();
  const [text, setText] = useState(line.note ?? "");
  const [allergy, setAllergy] = useState(startsAllergy);
  const [missing, setMissing] = useState(false);

  // The words are the one thing to write here: the field has the focus.
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  function save() {
    const words = text.trim();
    if (allergy && !words) {
      setMissing(true);
      field.current?.focus();
      return;
    }
    onSave(words || null, allergy);
  }

  return (
    <div className="flex flex-col gap-3 px-2 pt-1">
      <FieldRow label={t("note.allergySwitch")} htmlFor={switchId}>
        <Switch
          id={switchId}
          checked={allergy}
          onChange={(on) => {
            setAllergy(on);
            if (!on) setMissing(false);
          }}
        />
      </FieldRow>
      <TextArea
        ref={field}
        label={allergy ? t("note.allergyLabel") : t("note.label")}
        placeholder={
          allergy ? t("note.allergyPlaceholder") : t("note.placeholder")
        }
        hint={allergy ? t("note.allergyHint") : t("note.hint")}
        error={missing ? t("note.allergyMissing") : undefined}
        rows={3}
        maxLength={ORDER_CAPS.note}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (missing) setMissing(false);
        }}
      />
      <Button size="lg" onClick={save}>
        {t("note.save")}
      </Button>
      {line.note ? (
        <Button variant="ghost" onClick={() => onSave(null, false)}>
          {t("note.remove")}
        </Button>
      ) : null}
    </div>
  );
}
