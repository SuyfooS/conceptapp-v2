"use client";

import {
  choiceRule,
  draftMost,
  type GroupDraft,
  type GroupDraftProblem,
  type GroupProblem,
  MAX_EXTRAS_AGOROT,
  MENU_CAPS,
  MENU_TEXT_MAX,
  newGroupDraft,
  typedMost,
} from "@domain/order-taking";
import { Button } from "@ui/button";
import { FieldRow } from "@ui/field-row";
import { IconButton } from "@ui/icon-button";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextField } from "@ui/text-field";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { ltr, useShekels } from "./menu-parts";

/** The field a problem is said under, by its card and option: what the save focuses. */
export function problemField(problem: GroupDraftProblem): string {
  const card = `g${problem.group}`;
  switch (problem.problem) {
    case "optionMissing":
    case "optionTwice":
      return `${card}:o${problem.option ?? 0}:name`;
    case "priceUnclear":
      return `${card}:o${problem.option ?? 0}:price`;
    case "empty":
      return `${card}:add`;
    case "tooMuch":
      return `${card}:o0:price`;
    default:
      return `${card}:name`;
  }
}

/** The card-wide problems, said under the card's options. */
const CARD_WIDE: readonly GroupProblem[] = [
  "empty",
  "tooMuch",
  "tooManyGroups",
  "tooManyOptions",
];

/**
 * The item's choices in its sheet (waiter mode P6): a card a group, its
 * name, "חובה לבחור", "עד כמה בוחרים" and its rule as it reads now, then its
 * options, each with its name and what it adds to the price. Groups and
 * options go in the order added (default 6). A group removed goes with the
 * save, and until then comes back (default 7). Every problem is said under
 * its own field; `fields` holds them by `problemField`, so the save focuses
 * the first.
 */
export function ChoiceGroupsField({
  drafts,
  problems,
  onChange,
  fields,
}: {
  drafts: readonly GroupDraft[];
  problems: readonly GroupDraftProblem[];
  /** The cards as they are now, and the one that changed. */
  onChange: (drafts: GroupDraft[], changed: number) => void;
  fields: RefObject<Map<string, HTMLElement>>;
}) {
  const t = useTranslations("app.orders.menu");
  const shekels = useShekels();
  // What takes the focus once the change is drawn: a new card's name, a new
  // option's, the way back of a card removed.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    fields.current.get(key)?.focus();
  });
  const field = (key: string) => (element: HTMLElement | null) => {
    if (element) fields.current.set(key, element);
    else fields.current.delete(key);
  };
  const kept = drafts.filter((draft) => !draft.removed).length;

  const change = (at: number, next: GroupDraft, focus?: string) => {
    if (focus) focusNext.current = focus;
    onChange(
      drafts.map((draft, index) => (index === at ? next : draft)),
      at,
    );
  };
  const problemOf = (group: number, option?: number) =>
    problems.filter(
      (problem) => problem.group === group && problem.option === option,
    );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1">
        <h3 className="font-semibold text-base">{t("sheet.choices")}</h3>
        <p className="text-ink-2 text-sm">{t("groups.hint")}</p>
      </div>
      {drafts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <GroupCard
              // A card's place is its key: cards are only added at the end,
              // and a removed one stays until the save.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={index}
              index={index}
              draft={draft}
              problems={(option) => problemOf(index, option)}
              cardProblems={problems.filter(
                (problem) =>
                  problem.group === index &&
                  CARD_WIDE.includes(problem.problem),
              )}
              field={field}
              shekels={shekels}
              onChange={(next, focus) => change(index, next, focus)}
            />
          ))}
        </ul>
      ) : null}
      {kept < MENU_CAPS.groups ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            focusNext.current = `g${drafts.length}:name`;
            onChange([...drafts, newGroupDraft()], drafts.length);
          }}
        >
          <Plus aria-hidden="true" />
          {t("groups.add")}
        </Button>
      ) : (
        <p className="px-1 text-ink-2 text-sm">{t("groups.full")}</p>
      )}
    </section>
  );
}

function GroupCard({
  index,
  draft,
  problems,
  cardProblems,
  field,
  shekels,
  onChange,
}: {
  index: number;
  draft: GroupDraft;
  /** The problems said under a field: the card's own (no option), or an option's. */
  problems: (option?: number) => GroupDraftProblem[];
  cardProblems: GroupDraftProblem[];
  field: (key: string) => (element: HTMLElement | null) => void;
  shekels: (agorot: number) => string;
  onChange: (next: GroupDraft, focus?: string) => void;
}) {
  const t = useTranslations("app.orders.menu");
  const id = useId();
  const card = `g${index}`;
  const name = draft.name.trim() || t("group.unnamed");
  // "עד כמה בוחרים" as typed, while it is empty or past the options for a
  // moment (`typedMost`); null shows the draft's.
  const [mostTyped, setMostTyped] = useState<string | null>(null);

  if (draft.removed) {
    // The way back names its group, and the line beside it says what goes,
    // so two removed groups are never two of the same "החזרה".
    return (
      <li className="flex min-h-14 items-center justify-between gap-3 rounded-card bg-elevated px-4 py-2 shadow-card">
        <span id={`${id}-removed`} className="text-ink-2">
          {t("group.removed", { name })}
        </span>
        <Button
          ref={field(`${card}:restore`)}
          variant="ghost"
          className="-me-2 shrink-0 px-3"
          aria-describedby={`${id}-removed`}
          onClick={() => onChange({ ...draft, removed: false }, `${card}:name`)}
        >
          <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />
          {t("group.restore")}
          <span className="sr-only">{t("group.restoreFor", { name })}</span>
        </Button>
      </li>
    );
  }

  const most = draftMost(draft);
  const rule = choiceRule({
    min: draft.required ? Math.min(Math.max(1, draft.least), most) : 0,
    max: most,
    options: draft.options,
  });
  const ruleWords =
    rule === "one"
      ? t("sheet.rule.one")
      : rule === "upTo"
        ? t("sheet.rule.upTo", { max: most })
        : rule === "between"
          ? t("sheet.rule.between", {
              min: Math.min(Math.max(1, draft.least), most),
              max: most,
            })
          : t("sheet.rule.any");
  const nameProblem = problems().find(
    (problem) => problem.problem === "nameMissing",
  );
  const words = (problem: GroupDraftProblem) => {
    switch (problem.problem) {
      case "empty":
        return t("group.empty");
      case "tooMuch":
        return t.rich("group.tooMuch", {
          max: shekels(MAX_EXTRAS_AGOROT),
          ltr,
        });
      case "tooManyGroups":
        return t("groups.full");
      default:
        return t("group.optionsFull");
    }
  };
  // A problem of the whole card is said under its options, and read with
  // the field the save focuses for it (`problemField`).
  const cardProblemId = (problem: GroupDraftProblem) =>
    `${id}-${problem.problem}`;
  const describedBy = (key: string) =>
    cardProblems
      .filter((problem) => problemField(problem) === key)
      .map(cardProblemId)
      .join(" ") || undefined;

  return (
    <li className="flex flex-col gap-3 rounded-card bg-elevated p-4 shadow-card">
      <TextField
        ref={field(`${card}:name`)}
        label={t("group.name")}
        placeholder={t("group.namePlaceholder")}
        value={draft.name}
        maxLength={MENU_TEXT_MAX.group}
        autoComplete="off"
        error={nameProblem ? t("group.nameMissing") : undefined}
        aria-describedby={describedBy(`${card}:name`)}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <div className="-mx-4">
        <FieldRow
          label={t("group.required")}
          hint={t("group.requiredHint")}
          htmlFor={`${id}-required`}
        >
          <Switch
            id={`${id}-required`}
            checked={draft.required}
            onChange={(required) => onChange({ ...draft, required })}
          />
        </FieldRow>
        {draft.options.length > 1 ? (
          <FieldRow label={t("group.most")} htmlFor={`${id}-most`}>
            <Stepper
              id={`${id}-most`}
              value={mostTyped ?? String(most)}
              onValueChange={(value) => {
                const next = typedMost(value, draft.options.length);
                setMostTyped(next === null ? value : null);
                if (next !== null) onChange({ ...draft, most: next });
              }}
              onBlur={() => {
                if (mostTyped === null) return;
                const next = typedMost(mostTyped, draft.options.length, true);
                setMostTyped(null);
                if (next !== null) onChange({ ...draft, most: next });
              }}
              min={1}
              max={draft.options.length}
              decreaseLabel={t("group.less", { name })}
              increaseLabel={t("group.more", { name })}
            />
          </FieldRow>
        ) : null}
      </div>
      <p className="px-1 text-ink-2 text-sm" aria-live="polite">
        {ruleWords}
      </p>
      <ol className="flex flex-col gap-3">
        {draft.options.map((option, place) => {
          const mine = problems(place);
          const nameWrong = mine.find(
            (problem) =>
              problem.problem === "optionMissing" ||
              problem.problem === "optionTwice",
          );
          const priceWrong = mine.some(
            (problem) => problem.problem === "priceUnclear",
          );
          // The extras past the cap: said for the card, marked on its first price.
          const overCap = describedBy(`${card}:o${place}:price`);
          const label = t("group.option", { n: place + 1 });
          const setOption = (patch: Partial<typeof option>) =>
            onChange({
              ...draft,
              options: draft.options.map((o, at) =>
                at === place ? { ...o, ...patch } : o,
              ),
            });
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: an option's place is its row until the save
            <li key={place} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  ref={field(`${card}:o${place}:name`)}
                  label={label}
                  value={option.name}
                  maxLength={MENU_TEXT_MAX.option}
                  autoComplete="off"
                  error={
                    nameWrong
                      ? nameWrong.problem === "optionTwice"
                        ? t("group.optionTwice")
                        : t("group.optionMissing")
                      : undefined
                  }
                  onChange={(event) => setOption({ name: event.target.value })}
                />
              </div>
              <div className="w-28 shrink-0">
                <TextField
                  ref={field(`${card}:o${place}:price`)}
                  label={t("group.price")}
                  hint={place === 0 ? t("group.priceHint") : undefined}
                  error={priceWrong ? t("priceUnclear") : undefined}
                  aria-describedby={overCap}
                  aria-invalid={priceWrong || overCap ? true : undefined}
                  dir="ltr"
                  inputMode="decimal"
                  autoComplete="off"
                  value={option.price}
                  className={ltrInputClass}
                  onChange={(event) => setOption({ price: event.target.value })}
                />
              </div>
              <IconButton
                label={t("group.removeOption", {
                  name: option.name.trim() || label,
                })}
                icon={<Trash2 />}
                className="mt-7 -me-2 shrink-0"
                onClick={() =>
                  onChange(
                    {
                      ...draft,
                      options: draft.options.filter((_, at) => at !== place),
                    },
                    `${card}:add`,
                  )
                }
              />
            </li>
          );
        })}
      </ol>
      {cardProblems.map((problem) => (
        <p
          key={problem.problem}
          id={cardProblemId(problem)}
          className="px-1 text-danger text-sm"
        >
          {words(problem)}
        </p>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {draft.options.length < MENU_CAPS.options ? (
          <Button
            ref={field(`${card}:add`)}
            variant="ghost"
            className="-ms-2 px-3"
            aria-describedby={describedBy(`${card}:add`)}
            onClick={() =>
              onChange(
                {
                  ...draft,
                  options: [...draft.options, { name: "", price: "" }],
                },
                `${card}:o${draft.options.length}:name`,
              )
            }
          >
            <Plus aria-hidden="true" />
            {t("group.addOption")}
          </Button>
        ) : (
          <p className="px-1 text-ink-2 text-sm">{t("group.optionsFull")}</p>
        )}
        <Button
          variant="ghost"
          className="-me-2 px-3"
          onClick={() =>
            onChange({ ...draft, removed: true }, `${card}:restore`)
          }
        >
          <Trash2 aria-hidden="true" />
          {t("group.remove")}
        </Button>
      </div>
    </li>
  );
}
