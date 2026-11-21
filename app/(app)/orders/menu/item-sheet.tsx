"use client";

import { parseShekels } from "@domain/money";
import {
  type GroupDraftProblem,
  groupDrafts,
  groupsFromDrafts,
  type ItemChange,
  MAX_ITEM_AGOROT,
  MENU_TEXT_MAX,
  type MenuCategory,
  type MenuItem,
  typedAgorot,
} from "@domain/order-taking";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextArea, TextField } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { newId } from "../new-id";
import { ChoiceGroupsField, problemField } from "./choice-groups-field";
import type { MenuActionFailure, MenuDepartment } from "./menu-types";

/** The department choice that goes where the item's category goes. */
const SAME = "same";

/** What the sheet is open on: a new item, one saved, or nothing. */
export type Editing = { kind: "new" } | { kind: "item"; item: MenuItem } | null;

/**
 * An item's sheet (waiter mode P2): its name, price, description, category
 * and the department that prepares it, "נגמר", and since P6 its groups of
 * choices, edited here (`ChoiceGroupsField`). Every save sends the item
 * whole, as `public.save_menu_item` replaces every field (`itemSaveInput`).
 * A save someone else's overtook shows the item as it is now, said in a
 * line, and the person saves again. The save stays at the sheet's end,
 * never scrolling away, however long its choices make it.
 */
export function ItemSheet({
  editing,
  categories,
  departments,
  failure,
  saving,
  onClose,
  onSave,
  onSoldOut,
  onRemove,
}: {
  editing: Editing;
  categories: MenuCategory[];
  departments: MenuDepartment[];
  /** Why the last save didn't go through; "changed" shows the item as it is now. */
  failure: MenuActionFailure | null;
  saving: boolean;
  onClose: () => void;
  onSave: (change: Required<ItemChange>) => void;
  onSoldOut: (item: MenuItem, on: boolean) => void;
  onRemove: (item: MenuItem) => void;
}) {
  const t = useTranslations("app.orders.menu");
  const formId = useId();
  const item = editing?.kind === "item" ? editing.item : null;
  return (
    <Sheet
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item ? item.name : t("sheet.newTitle")}
      closeLabel={t("sheet.close")}
      footer={
        editing ? (
          <Button type="submit" form={formId} size="lg" loading={saving}>
            {item ? t("sheet.save") : t("sheet.add")}
          </Button>
        ) : null
      }
    >
      {editing ? (
        <ItemForm
          // A save overtaken by another draws the item as it is now.
          key={item ? `${item.id}:${item.version}` : "new"}
          formId={formId}
          item={item}
          categories={categories}
          departments={departments}
          failure={failure}
          saving={saving}
          onSave={onSave}
          onSoldOut={onSoldOut}
          onRemove={onRemove}
        />
      ) : null}
    </Sheet>
  );
}

function ItemForm({
  formId,
  item,
  categories,
  departments,
  failure,
  saving,
  onSave,
  onSoldOut,
  onRemove,
}: {
  /** The sheet's save, at its end, submits this form. */
  formId: string;
  item: MenuItem | null;
  categories: MenuCategory[];
  departments: MenuDepartment[];
  failure: MenuActionFailure | null;
  /** A save on its way: once it ends refused, its line takes the focus. */
  saving: boolean;
  onSave: (change: Required<ItemChange>) => void;
  onSoldOut: (item: MenuItem, on: boolean) => void;
  onRemove: (item: MenuItem) => void;
}) {
  const t = useTranslations("app.orders.menu");
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const priceField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? typedAgorot(item.priceAgorot) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(
    item?.category ?? categories[0]?.id ?? "",
  );
  // SAME goes where its category goes.
  const [department, setDepartment] = useState(item?.department ?? SAME);
  const failureLine = useRef<HTMLDivElement>(null);
  // Whatever was refused is said at the form's top, above the choices the
  // save at the sheet's end may have been pressed under: the line takes the
  // focus, so it is in sight and read before anything is saved again. Each
  // refusal, the same one twice too, once its save ends; drawn again with
  // the item as it is now ("changed"), as it comes.
  useEffect(() => {
    if (failure && !saving) failureLine.current?.focus();
  }, [failure, saving]);
  const [problem, setProblem] = useState<"name" | "price" | null>(null);
  // The groups of choices as typed, and what stops their save.
  const [groups, setGroups] = useState(() =>
    groupDrafts(item?.optionGroups ?? []),
  );
  const [groupProblems, setGroupProblems] = useState<GroupDraftProblem[]>([]);
  const groupFields = useRef(new Map<string, HTMLElement>());

  const nameOf = (departmentId: string) =>
    departments.find((d) => d.id === departmentId && d.live)?.name ??
    t("noRoute");
  const categoryOptions = categories.map((c) => ({
    key: c.id,
    label: c.name,
    hint: nameOf(c.department),
  }));
  const chosenCategory = categories.find((c) => c.id === category);
  const departmentOptions = [
    {
      key: SAME,
      label: t("sheet.departmentSame", {
        department: chosenCategory ? nameOf(chosenCategory.department) : "",
      }),
    },
    ...departments
      .filter((d) => d.live || d.id === department)
      .map((d) => ({ key: d.id, label: d.live ? d.name : t("noRoute") })),
  ];

  function save() {
    const words = name.trim();
    if (!words || [...words].length > MENU_TEXT_MAX.item) {
      setProblem("name");
      nameField.current?.focus();
      return;
    }
    const agorot = parseShekels(price, MAX_ITEM_AGOROT);
    if (agorot === null) {
      setProblem("price");
      priceField.current?.focus();
      return;
    }
    // Checked as the database checks them: nothing goes while one stands,
    // and the first takes the focus.
    const read = groupsFromDrafts(groups, newId);
    if (!read.ok) {
      setGroupProblems(read.problems);
      const [first] = read.problems;
      if (first) groupFields.current.get(problemField(first))?.focus();
      return;
    }
    onSave({
      name: words,
      priceAgorot: agorot,
      description: description.trim() || null,
      category,
      department: department === SAME ? null : department,
      optionGroups: read.groups,
    });
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-4 px-2 pt-1 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {failure ? (
        <Card
          ref={failureLine}
          tabIndex={-1}
          tone="flat"
          padding="md"
          role="alert"
          className="bg-elevated font-medium text-danger outline-none"
        >
          {t(`failed.${failure}`)}
        </Card>
      ) : null}
      <TextField
        ref={nameField}
        label={t("sheet.name")}
        value={name}
        maxLength={MENU_TEXT_MAX.item}
        autoComplete="off"
        error={problem === "name" ? t("sheet.nameMissing") : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (problem === "name") setProblem(null);
        }}
      />
      <TextField
        ref={priceField}
        label={t("sheet.price")}
        hint={t("sheet.priceHint")}
        error={problem === "price" ? t("priceUnclear") : undefined}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        value={price}
        className={ltrInputClass}
        onChange={(event) => {
          setPrice(event.target.value);
          if (problem === "price") setProblem(null);
        }}
      />
      <TextArea
        label={t("sheet.description")}
        hint={t("sheet.descriptionHint")}
        value={description}
        maxLength={MENU_TEXT_MAX.description}
        rows={2}
        dir="auto"
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <span className="font-medium text-sm">{t("sheet.category")}</span>
        <ChoiceMenu
          label={`${t("sheet.category")}: ${choiceShown(categoryOptions, category) ?? ""}`}
          value={category}
          options={categoryOptions}
          onChange={setCategory}
          className="text-ink"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <span className="font-medium text-sm">{t("sheet.department")}</span>
        <ChoiceMenu
          label={`${t("sheet.department")}: ${choiceShown(departmentOptions, department) ?? ""}`}
          value={department}
          options={departmentOptions}
          onChange={setDepartment}
          className="text-ink"
        />
      </div>
      {item ? (
        <div className="flex min-h-11 items-center justify-between gap-3 px-1">
          <span id={`${id}-sold`} className="font-medium text-sm">
            {t("soldOut")}
          </span>
          <Switch
            checked={!item.available}
            onChange={(on) => onSoldOut(item, on)}
            aria-labelledby={`${id}-sold`}
          />
        </div>
      ) : null}
      <ChoiceGroupsField
        drafts={groups}
        problems={groupProblems}
        fields={groupFields}
        onChange={(next, changed) => {
          setGroups(next);
          // What was typed in a card takes its problems with it.
          setGroupProblems((was) => was.filter((p) => p.group !== changed));
        }}
      />
      {item ? (
        <Button variant="ghost" onClick={() => onRemove(item)}>
          {t("sheet.remove")}
        </Button>
      ) : null}
    </form>
  );
}
