"use client";

import {
  changeDraftLine,
  choiceNames,
  type DraftLine,
  picksAgorot,
} from "@domain/order-screens";
import type { Menu } from "@domain/order-taking";
import { ORDER_CAPS } from "@domain/orders";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { FieldRow } from "@ui/field-row";
import { arrived } from "@ui/focus-after";
import { DraftLineRow } from "@ui/order-draft";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { TextArea } from "@ui/text-field";
import { useLocale } from "next-intl";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  answerHeard,
  type FocusAt,
  useQuietWhy,
} from "../../(auth)/step-results";
import { useOrdersMode } from "./orders-mode";
import { Price, useOrderWords } from "./orders-parts";

/**
 * The draft (the design's §3.2 step 3): what was chosen and not sent yet,
 * each line with how many, its note or allergy in sight, and "הערה",
 * "אלרגיה" and "לחכות עם זה" with no long press. One sheet for the note,
 * with an "אלרגיה" switch (default 1): an allergy needs its words. Since P6
 * each line names its choices and its unit price with them, and "בחירות"
 * opens them for a line whose item has any; a line whose picks no longer
 * fit the menu says "לבחור שוב".
 */
export function DraftPanel({
  draft,
  menu,
  routes,
  headingRef,
  onRemove,
  onNoteRemoved,
  onChoices,
  marked = null,
  stale = [],
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
  /** "בחירות": the line's choices, in their sheet. */
  onChoices: (line: DraftLine) => void;
  /**
   * The items a refusal names, by id, and the word it marks their lines
   * with: "נגמר" for what sold out meanwhile, "אין מחלקה שמכינה" for what no
   * department prepares.
   */
  marked?: { items: readonly string[]; word: string } | null;
  /** The lines whose picks no longer fit the menu (`staleChoiceLines`). */
  stale?: readonly string[];
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
  const itemOf = (line: DraftLine) =>
    menu?.items.find((item) => item.id === line.item);
  const nameOf = (line: DraftLine) => itemOf(line)?.name ?? "";
  // From what the draft holds when the change lands: a note saved from the
  // sheet after the line's quantity changed keeps both.
  const change = (id: string, patch: Parameters<typeof changeDraftLine>[2]) =>
    drafts.update(draft, (now) => changeDraftLine(now, id, patch));

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
              const item = itemOf(line);
              const name = item?.name ?? "";
              const forItem = t("draft.forItem", { name });
              // A refusal's own mark first: what sold out, or goes nowhere.
              const mark = marked?.items.includes(line.item)
                ? marked.word
                : stale.includes(line.id)
                  ? t("draft.choicesStale")
                  : null;
              const chooses =
                item !== undefined &&
                (item.optionGroups.length > 0 || line.choices.length > 0);
              return (
                <DraftLineRow
                  key={line.id}
                  name={name}
                  choices={item ? choiceNames(item, line.choices) : []}
                  price={
                    <Price
                      agorot={item ? picksAgorot(item, line.choices) : 0}
                    />
                  }
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
                  mark={mark}
                  allergy={
                    line.note && line.allergy
                      ? t("line.allergy", { note: line.note })
                      : null
                  }
                  held={line.held ? t("draft.heldBadge") : null}
                  choicesButton={
                    chooses
                      ? {
                          label: t("draft.choices"),
                          forItem,
                          onClick: () => onChoices(line),
                        }
                      : null
                  }
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

/** An allergy saved without its words, and where the focus was then. */
type Missing = { count: number; at: FocusAt };

/**
 * A line's one note, in a sheet: how to make it, never a customer's name;
 * with "אלרגיה" on, what to avoid, which whoever prepares it sees in danger
 * with the word. An allergy needs its words: saved without them, the field
 * is marked and says why, which is said once, as sign-in's fields say a
 * refusal (`answerHeard`). From "שמירת ההערה" the field takes the focus
 * once why is drawn, and the announcer says it after the field's own read;
 * from the field itself (a press that left the focus there), it is said at
 * once. Either way why is out of the field's description while it keeps
 * the focus (`useQuietWhy`), so it isn't heard twice, and back in it once
 * the focus leaves. Each such save is said, the same one again too.
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
  const [missing, setMissing] = useState<Missing | null>(null);
  const saves = useRef(0);
  const heard = useRef<Missing | null>(null);
  const { quiet, hush } = useQuietWhy(field);
  const locale = useLocale();
  const why = t("note.allergyMissing");

  // The words are the one thing to write here: the field has the focus.
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  // Each save without words once, as it is drawn (`arrived`: not when the
  // sheet is shown again), so the field is marked by the time it takes the
  // focus, and drawn without why in its description while it keeps it.
  useLayoutEffect(() => {
    if (!arrived(heard, missing)) return;
    const at = field.current;
    if (!missing || !at) return;
    const said = answerHeard({ error: why, at: missing.at });
    if (said.focus) at.focus();
    if (said.say) {
      announce(said.say.words, {
        politeness: said.say.politeness,
        lang: locale,
      });
    }
    if (said.quiet) hush(missing.count);
  }, [missing, why, hush, locale]);

  function save() {
    const words = text.trim();
    if (allergy && !words) {
      saves.current += 1;
      // The press, wherever it left the focus, is what the field takes it
      // from; only a field that has it keeps it.
      setMissing({
        count: saves.current,
        at: document.activeElement === field.current ? "field" : "lost",
      });
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
            if (!on) setMissing(null);
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
        error={missing ? why : undefined}
        quietMessage={missing !== null && quiet === missing.count}
        rows={3}
        maxLength={ORDER_CAPS.note}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (missing) setMissing(null);
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
