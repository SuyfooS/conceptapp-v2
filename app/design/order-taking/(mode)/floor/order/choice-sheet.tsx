"use client";

import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { useId, useState } from "react";
import {
  type ChoiceGroup,
  type MenuItem,
  missingGroups,
  singleChoice,
  toggleChoice,
} from "../../../model";
import { Price, useOrderWords } from "../../../parts";

/**
 * An item with choices (§3.2 step 3): its groups, the required ones first,
 * each saying "חובה לבחור"; how many; and "הוספה", which waits until every
 * required group has its choice and says which one is missing. A group of
 * exactly one choice is radios; any other, an optional extra of one option
 * included, is switches, so what was picked can be unpicked.
 */
export function ChoiceSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, choices: string[], qty: number) => void;
}) {
  const { t } = useOrderWords();
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item?.name ?? ""}
      subtitle={item ? <Price agorot={item.price} /> : undefined}
      closeLabel={t("sheet.close")}
    >
      {item ? <ChoiceForm key={item.id} item={item} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function ChoiceForm({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: (item: MenuItem, choices: string[], qty: number) => void;
}) {
  const { t, shekels } = useOrderWords();
  const id = useId();
  const [choices, setChoices] = useState<string[]>([]);
  const [qty, setQty] = useState("1");
  const groups = [...item.groups].sort((a, b) => b.min - a.min);
  const missing = missingGroups(item, choices);
  const count = Math.max(1, Math.min(99, Number(qty) || 1));

  function pickOne(groupOptions: string[], option: string) {
    setChoices((now) => [
      ...now.filter((c) => !groupOptions.includes(c)),
      option,
    ]);
  }
  function toggle(group: ChoiceGroup, option: string, on: boolean) {
    setChoices((now) => toggleChoice(group, now, option, on));
  }

  return (
    <div className="flex flex-col gap-5 px-2 pt-1">
      {groups.map((group) => {
        const optionIds = group.options.map((o) => o.id);
        const legend = (
          <span className="flex flex-wrap items-baseline gap-x-2">
            {group.name}
            <span className="font-medium text-ink-2 text-sm">
              {group.min > 0 ? t("choice.required") : t("choice.optional")}
            </span>
          </span>
        );
        if (singleChoice(group)) {
          return (
            <ChoiceList
              key={group.id}
              legend={legend}
              legendClassName="text-md"
              groupClassName="bg-elevated shadow-none"
            >
              {group.options.map((option) => (
                <ChoiceRow
                  key={option.id}
                  name={`${id}-${group.id}`}
                  value={option.id}
                  checked={choices.includes(option.id)}
                  onChange={() => pickOne(optionIds, option.id)}
                  title={option.name}
                  hint={
                    option.price > 0
                      ? t.rich("choice.extra", {
                          price: shekels(option.price),
                          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                        })
                      : undefined
                  }
                />
              ))}
            </ChoiceList>
          );
        }
        // More than one allowed and all taken: the rest wait for one off.
        const full =
          group.max > 1 &&
          optionIds.filter((o) => choices.includes(o)).length >= group.max;
        return (
          <fieldset
            key={group.id}
            className="m-0 flex min-w-0 flex-col border-0 p-0"
          >
            <legend className="mb-3 px-1 font-bold text-md">{legend}</legend>
            <div className="overflow-hidden rounded-card bg-elevated">
              {group.options.map((option) => {
                const labelId = `${id}-${option.id}`;
                const on = choices.includes(option.id);
                return (
                  <div
                    key={option.id}
                    className="relative flex min-h-16 items-center gap-3 px-4 py-2 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span id={labelId} className="font-medium">
                        {option.name}
                      </span>
                      {option.price > 0 ? (
                        <span className="text-ink-2 text-sm">
                          {t.rich("choice.extra", {
                            price: shekels(option.price),
                            ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                          })}
                        </span>
                      ) : null}
                    </span>
                    <Switch
                      checked={on}
                      disabled={full && !on}
                      onChange={(next) => toggle(group, option.id, next)}
                      aria-labelledby={labelId}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div className="flex items-center justify-between gap-3 px-1">
        <span aria-hidden="true" className="font-bold text-md">
          {t("choice.qty")}
        </span>
        <Stepper
          wide
          value={qty}
          onValueChange={setQty}
          min={1}
          max={99}
          label={t("choice.qty")}
          decreaseLabel={t("draft.less", { name: item.name })}
          increaseLabel={t("draft.more", { name: item.name })}
        />
      </div>
      {missing.length > 0 ? (
        <p className="px-1 text-ink-2">
          {t("choice.missing", {
            groups: missing.map((group) => group.name).join(", "),
          })}
        </p>
      ) : null}
      <Button
        size="lg"
        disabled={missing.length > 0}
        onClick={() => onAdd(item, choices, count)}
      >
        {t("choice.add", { count })}
      </Button>
    </div>
  );
}
