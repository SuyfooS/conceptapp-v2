"use client";

import { WEEKDAY_KEYS } from "@domain/availability-form";
import type { ManageReadOnly } from "@domain/manage-access";
import type { ModuleKey } from "@domain/modules";
import { displayIsraeliPhone, normalizeIsraeliPhone } from "@domain/phone";
import type { SettingEntry, SettingField } from "@domain/settings-form";
import type { Position, ShiftPattern } from "@domain/staffing";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { ltrInputClass } from "@ui/text-field";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { PositionsEditor } from "./positions-editor";
import type {
  SaveSettings,
  SettingsFailure,
  SettingsResult,
} from "./settings-types";
import { ShiftsEditor } from "./shifts-editor";
import { TYPING_MS, useDraft } from "./use-draft";

/**
 * A module's settings, drawn from what its manifest declares: a new setting
 * appears here by itself, with its words from the message files. Each control
 * saves itself, as in a phone's settings, so there is nothing to forget. What
 * failed goes back to what's stored, and says so.
 */
export function SettingsForm({
  module,
  fields,
  values,
  save,
  readOnly,
  departments = [],
  departmentsHref = null,
}: {
  module: ModuleKey;
  fields: SettingField[];
  values: Record<string, unknown>;
  save: SaveSettings;
  /**
   * The business's live departments, in their order, for a field chosen
   * from them (who takes orders, P4), by their keys.
   */
  departments?: readonly { key: string; name: string }[];
  /** Where the departments are added, for a business that has none. */
  departmentsHref?: string | null;
  /**
   * Why nothing here saves, said in one line over the fields: a view
   * session, the person at view on the management page, or without the
   * module's own edit. Null when it saves.
   */
  readOnly: ManageReadOnly;
}) {
  const viewOnly = readOnly !== null;
  const t = useTranslations("app.manage");
  const tm = useTranslations("modules");
  // What this person changed on this screen; the rest is as the server read it.
  const [changed, setChanged] = useState<Record<string, unknown>>({});
  // The last thing that didn't save, until that setting saves; `held` while
  // its words wait for `sayHeld`.
  const [failure, setFailure] = useState<{
    key: string;
    reason: SettingsFailure;
    held: boolean;
  } | null>(null);
  const [saved, setSaved] = useState(0);
  const latest = useRef<Record<string, number>>({});

  const currentOf = (key: string) =>
    key in changed ? changed[key] : values[key];

  /**
   * Says whether it saved, for a control with more to do either way. With
   * `hold`, a refusal's words wait for `sayHeld`: for an editor that moves
   * the focus as it is refused (a shift's row, back once its sheet has
   * gone), a move that would cut them off.
   */
  async function change(
    key: string,
    value: unknown,
    hold = false,
  ): Promise<boolean> {
    const mine = (latest.current[key] ?? 0) + 1;
    latest.current[key] = mine;
    setChanged((current) => ({ ...current, [key]: value }));
    let result: SettingsResult;
    try {
      result = await save({ [key]: value });
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      setFailure((current) => (current?.key === key ? null : current));
      setSaved((count) => count + 1);
      return true;
    }
    setFailure({ key, reason: result.failure, held: hold });
    // A later change to the same setting has the last word.
    if (latest.current[key] === mine) {
      setChanged(({ [key]: _, ...rest }) => rest);
    }
    return false;
  }

  /** A refusal of `key` held back (`hold`) is said now: the focus has moved. */
  function sayHeld(key: string) {
    setFailure((current) =>
      current?.key === key && current.held
        ? { ...current, held: false }
        : current,
    );
  }

  // The keys come from the manifest; tooling/settings-words.test.ts checks them.
  const words = (key: string, part: string) =>
    `${module}.settings.${key}.${part}` as never;

  const plain = fields.filter(
    (field) =>
      field.kind !== "editor" ||
      (field.editor !== "positions" &&
        field.editor !== "shifts" &&
        field.editor !== "departments"),
  );
  const nameOf = (field: SettingField): ReactNode => (
    <>
      {tm(words(field.key, "label"))}
      {field.level === "team" ? (
        <Badge tone="neutral" className="ms-2 align-middle">
          {t("advanced")}
        </Badge>
      ) : field.level === "owner" ? (
        <Badge tone="neutral" className="ms-2 align-middle">
          {t("ownerOnly")}
        </Badge>
      ) : null}
    </>
  );
  const hintOf = (field: SettingField) =>
    tm.has(words(field.key, "hint")) ? tm(words(field.key, "hint")) : undefined;

  return (
    <>
      <StatusToast
        message={saved > 0 ? t("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      {failure && !failure.held ? (
        <Card
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 font-medium text-danger xl:top-4"
        >
          {tm(words(failure.key, "label"))}: {t(`failed.${failure.reason}`)}
        </Card>
      ) : null}
      {readOnly ? (
        <p className="text-ink-2">
          {readOnly === "viewing"
            ? t("viewOnly")
            : readOnly === "manage"
              ? t("readOnly.manage")
              : t("readOnly.module", { module: tm(`${module}.name`) })}
        </p>
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-3">
        {plain.length > 0 ? (
          <FieldGroup>
            {plain.map((field) => (
              <PlainField
                key={field.key}
                field={field}
                name={nameOf(field)}
                plainName={tm(words(field.key, "label"))}
                hint={hintOf(field)}
                value={currentOf(field.key)}
                optionName={(option) =>
                  tm(words(field.key, `options.${option}`))
                }
                disabled={viewOnly}
                onChange={(value) => change(field.key, value)}
              />
            ))}
          </FieldGroup>
        ) : null}
        {fields.map((field) => {
          if (field.kind !== "editor") return null;
          if (field.editor === "positions") {
            return (
              <PositionsEditor
                key={field.key}
                title={tm(words(field.key, "label"))}
                hint={hintOf(field)}
                positions={currentOf(field.key) as Position[]}
                disabled={viewOnly}
                onChange={(next) => change(field.key, next)}
              />
            );
          }
          if (field.editor === "departments") {
            return (
              <DepartmentsField
                key={field.key}
                name={nameOf(field)}
                hint={hintOf(field)}
                departments={departments}
                href={departmentsHref}
                value={currentOf(field.key)}
                disabled={viewOnly}
                onChange={(next) => change(field.key, next)}
              />
            );
          }
          if (field.editor === "shifts") {
            return (
              <ShiftsEditor
                key={field.key}
                title={tm(words(field.key, "label"))}
                hint={hintOf(field)}
                shifts={currentOf(field.key) as ShiftPattern[]}
                disabled={viewOnly}
                onChange={(next, hold) => change(field.key, next, hold)}
                sayRefusal={() => sayHeld(field.key)}
              />
            );
          }
          return null;
        })}
      </div>
    </>
  );
}

function PlainField({
  field,
  name,
  plainName,
  hint,
  value,
  optionName,
  disabled,
  onChange,
}: {
  field: SettingField;
  name: ReactNode;
  plainName: string;
  hint: string | undefined;
  value: unknown;
  optionName: (option: string) => string;
  disabled: boolean;
  onChange: (value: unknown) => unknown;
}) {
  const tDays = useTranslations("days");
  const id = useId();
  // The line under the label, read with the control it is about.
  const hintId = `${id}-hint`;

  switch (field.kind) {
    case "toggle":
      return (
        <FieldRow label={name} hint={hint} hintId={hintId} htmlFor={id}>
          <Switch
            id={id}
            checked={value === true}
            disabled={disabled}
            onChange={onChange}
            aria-describedby={hint ? hintId : undefined}
          />
        </FieldRow>
      );
    case "choice": {
      const options = field.options.map((option) => ({
        key: String(option),
        label: optionName(String(option)),
      }));
      const current = options.find((o) => o.key === String(value))?.label;
      return (
        <FieldRow label={name} hint={hint}>
          <MenuOrValue
            label={`${plainName}: ${current ?? ""}`}
            value={String(value)}
            options={options}
            disabled={disabled}
            onChange={(key) =>
              onChange(field.options.find((option) => String(option) === key))
            }
          />
        </FieldRow>
      );
    }
    case "number":
      return (
        <NumberField
          id={id}
          hintId={hintId}
          name={name}
          hint={hint}
          value={typeof value === "number" ? value : 0}
          plainName={plainName}
          min={field.min}
          max={field.max}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextField
          name={name}
          hint={hint}
          value={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
          entry={field.entry}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "editor":
      if (field.editor === "time") {
        return (
          <TimeField
            id={id}
            hintId={hintId}
            name={name}
            hint={hint}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={onChange}
          />
        );
      }
      if (field.editor === "weekday") {
        const options = WEEKDAY_KEYS.map((day, index) => ({
          key: String(index),
          label: tDays(`${day}.long`),
        }));
        const current = options.find((o) => o.key === String(value))?.label;
        return (
          <FieldRow label={name} hint={hint}>
            <MenuOrValue
              label={`${plainName}: ${current ?? ""}`}
              value={String(value)}
              options={options}
              disabled={disabled}
              onChange={(key) => onChange(Number(key))}
            />
          </FieldRow>
        );
      }
      return null;
  }
}

/** A menu, or just the value while nothing can be changed. */
function MenuOrValue({
  disabled,
  ...menu
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  disabled: boolean;
  onChange: (key: string) => void;
}) {
  if (disabled) {
    return (
      <span className="font-medium text-ink-2">
        {menu.options.find((option) => option.key === menu.value)?.label}
      </span>
    );
  }
  return <ChoiceMenu {...menu} />;
}

/**
 * A whole number between its ends. Its digits save once the field is left
 * (or on Enter), never as they are typed: on the way from 42 to 50 the field
 * reads 4 and 5, and out of its ends 60 starts as 6, none of them chosen. A
 * press of minus or plus saves soon after, so a few quick presses save once.
 * Its hint, or the ends while what is typed is outside them, is read with it.
 */
function NumberField({
  id,
  hintId,
  name,
  plainName,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  hintId: string;
  name: ReactNode;
  plainName: string;
  hint: string | undefined;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => unknown;
}) {
  const t = useTranslations("app.manage");
  const { draft, whole, edit, leave } = useDraft(
    String(value),
    (text) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max,
    (text) => onChange(Number(text)),
    null,
    (text) => (/^\d+$/.test(text) ? String(Number(text)) : text),
  );
  const line = whole ? hint : t("between", { min, max });
  return (
    <FieldRow label={name} hint={line} hintId={hintId} htmlFor={id}>
      {disabled ? (
        <span dir="ltr" className="font-medium text-ink-2">
          {value}
        </span>
      ) : (
        <Stepper
          id={id}
          value={draft}
          onValueChange={edit}
          onStep={(next) => edit(next, TYPING_MS)}
          onBlur={leave}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          invalid={!whole}
          describedBy={line ? hintId : undefined}
          min={min}
          max={max}
          decreaseLabel={t("decrease", { name: plainName })}
          increaseLabel={t("increase", { name: plainName })}
        />
      )}
    </FieldRow>
  );
}

function TimeField({
  id,
  hintId,
  name,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  hintId: string;
  name: ReactNode;
  hint: string | undefined;
  value: string;
  disabled: boolean;
  onChange: (value: string) => unknown;
}) {
  const { draft, edit, leave } = useDraft(
    value,
    (text) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text),
    onChange,
    TYPING_MS,
  );
  return (
    <FieldRow label={name} hint={hint} hintId={hintId} htmlFor={id}>
      <input
        id={id}
        type="time"
        dir="ltr"
        value={draft}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => edit(event.target.value)}
        onBlur={leave}
        className={`${rowPillInputClass} ${ltrInputClass}`}
      />
    </FieldRow>
  );
}

/** How each entry is typed: its keyboard and its input type. */
const ENTRY: Record<
  SettingEntry,
  { inputMode: "url" | "tel" | "numeric"; type: "url" | "tel" | "text" }
> = {
  link: { inputMode: "url", type: "url" },
  phone: { inputMode: "tel", type: "tel" },
  digits: { inputMode: "numeric", type: "text" },
};

/** A phone as people write it: what is stored (E.164) and what is typed read the same. */
const asPhone = (text: string) => {
  const phone = normalizeIsraeliPhone(text);
  return phone ? displayIsraeliPhone(phone) : text.trim();
};

/**
 * One line of text, saved trimmed once it is left. A link, a phone or
 * digits (`entry`) are typed left to right with their own keyboard, and the
 * manifest's field tidies what is saved; a phone reads as people write it.
 */
function TextField({
  name,
  hint,
  value,
  maxLength,
  entry,
  disabled,
  onChange,
}: {
  name: ReactNode;
  hint: string | undefined;
  value: string;
  maxLength: number | undefined;
  entry: SettingEntry | undefined;
  disabled: boolean;
  onChange: (value: string) => unknown;
}) {
  const phone = entry === "phone";
  const { draft, edit, leave } = useDraft(
    phone ? displayIsraeliPhone(value) : value,
    () => true,
    (text) => onChange(text.trim()),
    null,
    phone ? asPhone : (text) => text.trim(),
  );
  const typed = entry ? ENTRY[entry] : null;
  return (
    <GroupedField
      label={name}
      hint={hint}
      value={draft}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event) => edit(event.target.value)}
      onBlur={leave}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      {...(typed
        ? {
            dir: "ltr",
            className: ltrInputClass,
            type: typed.type,
            inputMode: typed.inputMode,
            autoComplete: "off",
            autoCapitalize: "none",
            spellCheck: false,
          }
        : {})}
    />
  );
}

/**
 * A setting chosen from the business's departments, by their keys (who takes
 * orders, P4): a switch for each live one, in their order, saving itself as
 * the others do. A key kept for a department removed since stays as it is.
 * A business with none is sent to add them.
 */
function DepartmentsField({
  name,
  hint,
  departments,
  href,
  value,
  disabled,
  onChange,
}: {
  name: ReactNode;
  hint: string | undefined;
  departments: readonly { key: string; name: string }[];
  href: string | null;
  value: unknown;
  disabled: boolean;
  onChange: (keys: string[]) => unknown;
}) {
  const t = useTranslations("app.manage.departmentsSetting");
  const keys = Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string")
    : [];
  function toggle(key: string, on: boolean) {
    const others = keys.filter((k) => k !== key);
    // In the business's order, then what no live department has any more.
    const live = departments
      .map((d) => d.key)
      .filter((k) => (k === key ? on : others.includes(k)));
    const gone = others.filter((k) => !departments.some((d) => d.key === k));
    onChange([...live, ...gone]);
  }
  // A section of the page, as the positions and the shifts are: its title
  // comes after the page's h1 on /manage/<module>, and beside the other
  // editors inside the module's h2 in the console.
  return (
    <PageSection title={name}>
      {hint ? <p className="-mt-1 px-1 text-ink-2 text-sm">{hint}</p> : null}
      {departments.length === 0 ? (
        <Card padding="lg" className="flex flex-col items-start gap-3">
          <p className="text-ink-2">{t("none")}</p>
          {href ? (
            <Button asChild variant="secondary">
              <Link href={href}>{t("add")}</Link>
            </Button>
          ) : null}
        </Card>
      ) : (
        <FieldGroup>
          {departments.map((department) => (
            <DepartmentSwitch
              key={department.key}
              label={department.name}
              checked={keys.includes(department.key)}
              disabled={disabled}
              onChange={(on) => toggle(department.key, on)}
            />
          ))}
        </FieldGroup>
      )}
    </PageSection>
  );
}

function DepartmentSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </FieldRow>
  );
}
