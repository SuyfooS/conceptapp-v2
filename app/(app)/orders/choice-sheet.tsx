"use client";

import {
  type DraftLine,
  groupFull,
  keepPicks,
  orderedPicks,
  pickedIn,
  pickState,
  picksAgorot,
  toggleChoice,
  waitingGroups,
} from "@domain/order-screens";
import {
  type ChoicePick,
  choiceRule,
  type MenuItem,
  type OptionGroup,
} from "@domain/order-taking";
import { ORDER_CAPS } from "@domain/orders";
import { Button } from "@ui/button";
import { ChoiceGroup } from "@ui/choice-group";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { useId, useState } from "react";
import { ltr, Price, useOrderWords } from "./orders-parts";

/** What the sheet is for: a new line of the item, or a line's choices. */
export type ChoiceTarget = { mode: "new" } | { mode: "edit"; line: DraftLine };

/**
 * An item's choices (waiter mode P6, the design's §3.2): its groups, those
 * that must be chosen first, each with its rule in words; one of exactly one
 * as radios, any other as switches. Its price under its name, with what is
 * picked so far. At the end, never scrolling away, how many and "הוספה",
 * which waits for every required group and says which are left; from a
 * draft line, "שמירת הבחירות" for that line alone (its count stays its own).
 * The item is the menu's as it is now, so a sync changes it in place: a pick
 * it no longer has is left out, a group whose most went under its picks
 * says so and the action waits until enough are taken off (a group of one
 * until one is chosen again), as the send would refuse them, and once it
 * sold out nothing is added.
 */
export function ChoiceSheet({
  item,
  target,
  onAdd,
  onSave,
  onClose,
}: {
  /** The item, from the menu as it is now; null while the sheet is closed. */
  item: MenuItem | null;
  target: ChoiceTarget | null;
  onAdd: (item: MenuItem, picks: ChoicePick[], quantity: number) => void;
  onSave: (item: MenuItem, line: DraftLine, picks: ChoicePick[]) => void;
  onClose: () => void;
}) {
  const { t } = useOrderWords();
  const open = item !== null && target !== null;
  // Each opening starts from the line's picks, or none: a state that follows
  // what the sheet is open on.
  const openOn = open
    ? `${item.id}:${target.mode === "edit" ? target.line.id : "new"}`
    : null;
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [picks, setPicks] = useState<ChoicePick[]>([]);
  const [quantity, setQuantity] = useState("1");
  if (openOn !== shownFor) {
    setShownFor(openOn);
    if (open) {
      setPicks(
        target.mode === "edit" ? keepPicks(item, target.line.choices) : [],
      );
      setQuantity("1");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={item?.name ?? ""}
      subtitle={item ? <SheetPrice item={item} picks={picks} /> : undefined}
      closeLabel={t("choice.close")}
      footer={
        open ? (
          <ChoiceFooter
            item={item}
            target={target}
            picks={picks}
            quantity={quantity}
            onQuantity={setQuantity}
            onAdd={onAdd}
            onSave={onSave}
          />
        ) : null
      }
    >
      {open ? (
        <ChoiceGroups
          item={item}
          picks={picks}
          onPicks={setPicks}
          // Sold out meanwhile: nothing is picked for a new line.
          disabled={target.mode === "new" && blockedNow(item)}
        />
      ) : null}
    </Sheet>
  );
}

/** Sold out, or no department prepares it: nothing of it is added now. */
function blockedNow(item: MenuItem): boolean {
  const state = pickState(item);
  return state === "soldOut" || state === "noRoute";
}

/** Under the item's name: its price with what is picked, and "נגמר" once it sold out. */
function SheetPrice({
  item,
  picks,
}: {
  item: MenuItem;
  picks: readonly ChoicePick[];
}) {
  const { t } = useOrderWords();
  const state = pickState(item);
  return (
    <>
      <Price agorot={picksAgorot(item, picks)} />
      {state === "soldOut" ? ` · ${t("picker.soldOut")}` : null}
      {state === "noRoute" ? ` · ${t("picker.noRoute")}` : null}
    </>
  );
}

/** The item's groups, those that must be chosen first, each in its order. */
function ChoiceGroups({
  item,
  picks,
  onPicks,
  disabled,
}: {
  item: MenuItem;
  picks: readonly ChoicePick[];
  onPicks: (picks: ChoicePick[]) => void;
  disabled: boolean;
}) {
  const { t, shekels } = useOrderWords();
  // What the menu no longer has is left out, whatever was picked before.
  const kept = keepPicks(item, picks);
  const groups = [...item.optionGroups].sort(
    (a, b) => Number(b.min > 0) - Number(a.min > 0),
  );
  const rule = (group: OptionGroup) => {
    switch (choiceRule(group)) {
      case "one":
        return t("choice.rule.one");
      case "between":
        return t("choice.rule.between", { min: group.min, max: group.max });
      case "upTo":
        return t("choice.rule.upTo", { max: group.max });
      default:
        return t("choice.rule.any");
    }
  };
  // Under the group; while it says anything, its switches still off wait.
  const note = (group: OptionGroup, one: boolean) => {
    const count = pickedIn(group, kept);
    // Past its most (the menu lowered it under a line's picks), a group of
    // up to one too: how many to take off. Radios can't show two at once,
    // so a group of one shows none and asks for one again.
    if (count > group.max) {
      return one
        ? t("choice.overOne", { count })
        : t("choice.over", {
            count,
            max: group.max,
            extra: count - group.max,
          });
    }
    // At its most, with an option still off: the rest wait until one is
    // taken off. A group of up to one replaces its pick instead, and one
    // whose every option may be on has nothing to wait for.
    return groupFull(group, kept) ? t("choice.full", { max: group.max }) : null;
  };
  return (
    <div className="flex flex-col gap-5 px-2 pt-1 pb-2">
      {groups.map((group) => {
        const mine = kept
          .filter((pick) => pick.group === group.id)
          .map((pick) => pick.option);
        // As `waitingGroups` reads it: a group of one over asks to choose.
        const one = choiceRule(group) === "one";
        const over = pickedIn(group, kept) > group.max;
        return (
          <ChoiceGroup
            key={group.id}
            name={group.name}
            rule={rule(group)}
            kind={one ? "one" : "many"}
            options={group.options.map((option) => ({
              id: option.id,
              name: option.name,
              hint:
                option.priceAgorot > 0
                  ? t.rich("choice.extra", {
                      price: shekels(option.priceAgorot),
                      ltr,
                    })
                  : undefined,
            }))}
            picked={over && one ? [] : mine}
            full={note(group, one)}
            disabled={disabled}
            onPick={(option, on) =>
              onPicks(toggleChoice(group, kept, option, on))
            }
          />
        );
      })}
    </div>
  );
}

/**
 * The sheet's end: how many (a new line), what to do before the action, and
 * the main action, which waits until every group has from its least to its
 * most: what `checkPicks` takes, so the send takes it too. Each line says the
 * action and what is done for it, as the group's own note says it: which
 * groups to choose in (a group of one past its most among them, its radios
 * showing none), and which to take picks off.
 */
function ChoiceFooter({
  item,
  target,
  picks,
  quantity,
  onQuantity,
  onAdd,
  onSave,
}: {
  item: MenuItem;
  target: ChoiceTarget;
  picks: readonly ChoicePick[];
  quantity: string;
  onQuantity: (value: string) => void;
  onAdd: (item: MenuItem, picks: ChoicePick[], quantity: number) => void;
  onSave: (item: MenuItem, line: DraftLine, picks: ChoicePick[]) => void;
}) {
  const { t } = useOrderWords();
  const qtyId = useId();
  const missingId = useId();
  const overId = useId();
  const kept = orderedPicks(item, keepPicks(item, picks));
  const { choose: missing, takeOff: over } = waitingGroups(item, kept);
  const waits = missing.length > 0 || over.length > 0;
  const describedBy =
    [missing.length > 0 ? missingId : null, over.length > 0 ? overId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const count = Number(quantity);
  const counted =
    Number.isInteger(count) && count >= 1 && count <= ORDER_CAPS.quantity;
  const blocked = blockedNow(item);
  return (
    <>
      {target.mode === "new" ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <label htmlFor={qtyId} className="font-medium">
            {t("choice.qty")}
          </label>
          <Stepper
            id={qtyId}
            value={quantity}
            onValueChange={onQuantity}
            onBlur={() => {
              if (!counted) onQuantity("1");
            }}
            min={1}
            max={ORDER_CAPS.quantity}
            decreaseLabel={t("draft.less", { name: item.name })}
            increaseLabel={t("draft.more", { name: item.name })}
          />
        </div>
      ) : null}
      {missing.length > 0 ? (
        <p id={missingId} className="px-1 text-ink-2 text-sm">
          {/* Said for the action under it: adding a line, or saving one's. */}
          {t(target.mode === "new" ? "choice.missing" : "choice.missingSave", {
            groups: missing.map((group) => group.name).join(", "),
          })}
        </p>
      ) : null}
      {over.length > 0 ? (
        <p id={overId} className="px-1 text-ink-2 text-sm">
          {/* Which groups to take off from, for the action under it; each group says how many. */}
          {t(target.mode === "new" ? "choice.tooMany" : "choice.tooManySave", {
            groups: over.map((group) => group.name).join(", "),
          })}
        </p>
      ) : null}
      {target.mode === "new" ? (
        <Button
          size="lg"
          disabled={waits || !counted || blocked}
          aria-describedby={describedBy}
          onClick={() => onAdd(item, kept, count)}
        >
          {t("choice.add", { count: counted ? count : 1 })}
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={waits}
          aria-describedby={describedBy}
          onClick={() => onSave(item, target.line, kept)}
        >
          {t("choice.save")}
        </Button>
      )}
    </>
  );
}
