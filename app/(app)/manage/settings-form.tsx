"use client";

import { WEEKDAY_KEYS } from "@domain/availability-form";
import type { ModuleKey } from "@domain/modules";
import type { SettingField } from "@domain/settings-form";
import type { Position, ShiftPattern } from "@domain/staffing";
import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { StatusToast } from "@ui/status-toast";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { ltrInputClass } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { PositionsEditor } from "./positions-editor";
import type {
  SaveSettings,
  SettingsFailure,
  SettingsResult,
} from "./settings-types";
import { ShiftsEditor } from "./shifts-editor";

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
  viewOnly,
}: {
  module: ModuleKey;
  fields: SettingField[];
  values: Record<string, unknown>;
  save: SaveSettings;
  viewOnly: boolean;
}) {
  const t = useTranslations("app.manage");
  const tm = useTranslations("modules");
  // What this person changed on this screen; the rest is as the server read it.
  const [changed, setChanged] = useState<Record<string, unknown>>({});
  const [failure, setFailure] = useState<SettingsFailure | null>(null);
  const [saved, setSaved] = useState(0);
  const latest = useRef<Record<string, number>>({});

  const currentOf = (key: string) =>
    key in changed ? changed[key] : values[key];

  async function change(key: string, value: unknown) {
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
      setFailure(null);
      setSaved((count) => count + 1);
      return;
    }
    setFailure(result.failure);
    // A later change to the same setting has the last word.
    if (latest.current[key] === mine) {
      setChanged(({ [key]: _, ...rest }) => rest);
    }
  }

  // The keys come from the manifest; tooling/settings-words.test.ts checks them.
  const words = (key: string, part: string) =>
    `${module}.settings.${key}.${part}` as never;

  const plain = fields.filter(
    (field) =>
      field.kind !== "editor" ||
      (field.editor !== "positions" && field.editor !== "shifts"),
  );
  const nameOf = (field: SettingField): ReactNode => (
    <>
      {tm(words(field.key, "label"))}
      {field.level === "team" ? (
        <Badge tone="neutral" className="ms-2 align-middle">
          {t("advanced")}
        </Badge>
      ) : null}
    </>
  );
  const hintOf = (field: SettingField) =>
    tm.has(words(field.key, "hint")) ? tm(words(field.key, "hint")) : undefined;

  return (
    <>
      <StatusToast
        message={saved > 0 && !failure ? t("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      {failure ? (
        <Card
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 font-medium text-danger xl:top-4"
        >
          {t(`failed.${failure}`)}
        </Card>
      ) : null}
      {viewOnly ? <p className="text-ink-2">{t("viewOnly")}</p> : null}
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
          if (field.editor === "shifts") {
            return (
              <ShiftsEditor
                key={field.key}
                title={tm(words(field.key, "label"))}
                hint={hintOf(field)}
                shifts={currentOf(field.key) as ShiftPattern[]}
                disabled={viewOnly}
                onChange={(next) => change(field.key, next)}
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
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations("app.manage");
  const tDays = useTranslations("days");
  const id = useId();

  switch (field.kind) {
    case "toggle":
      return (
        <FieldRow label={name} hint={hint} htmlFor={id}>
          <Switch
            id={id}
            checked={value === true}
            disabled={disabled}
            onChange={onChange}
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
          name={name}
          hint={hint}
          value={typeof value === "number" ? value : 0}
          min={field.min ?? 0}
          max={field.max ?? 999}
          disabled={disabled}
          decreaseLabel={t("decrease", { name: plainName })}
          increaseLabel={t("increase", { name: plainName })}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextField
          name={plainName}
          hint={hint}
          value={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "editor":
      if (field.editor === "time") {
        return (
          <TimeField
            id={id}
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
 * A value that's typed, so it can be half written for a moment: what's on
 * screen until it's whole, saved shortly after the typing stops or on leaving.
 * Comes back to what's stored when a save fails.
 */
function useDraft(
  stored: string,
  isWhole: (draft: string) => boolean,
  save: (draft: string) => void,
  delay: number | null,
) {
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored);
  }

  function settle() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return {
    draft,
    edit(next: string) {
      setDraft(next);
      settle();
      if (delay !== null && isWhole(next) && next !== stored) {
        timer.current = setTimeout(() => save(next), delay);
      }
    },
    leave() {
      settle();
      if (!isWhole(draft)) setDraft(stored);
      else if (draft !== stored) save(draft);
    },
  };
}

const TYPING_MS = 500;

function NumberField({
  id,
  name,
  hint,
  value,
  min,
  max,
  disabled,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  id: string;
  name: ReactNode;
  hint: string | undefined;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (value: number) => void;
}) {
  const { draft, edit, leave } = useDraft(
    String(value),
    (text) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max,
    (text) => onChange(Number(text)),
    TYPING_MS,
  );
  return (
    <FieldRow label={name} hint={hint} htmlFor={id}>
      {disabled ? (
        <span dir="ltr" className="font-medium text-ink-2">
          {value}
        </span>
      ) : (
        <Stepper
          id={id}
          value={draft}
          onValueChange={edit}
          onBlur={leave}
          min={min}
          max={max}
          decreaseLabel={decreaseLabel}
          increaseLabel={increaseLabel}
        />
      )}
    </FieldRow>
  );
}

function TimeField({
  id,
  name,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  name: ReactNode;
  hint: string | undefined;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { draft, edit, leave } = useDraft(
    value,
    (text) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text),
    onChange,
    TYPING_MS,
  );
  return (
    <FieldRow label={name} hint={hint} htmlFor={id}>
      <input
        id={id}
        type="time"
        dir="ltr"
        value={draft}
        disabled={disabled}
        onChange={(event) => edit(event.target.value)}
        onBlur={leave}
        className={`${rowPillInputClass} ${ltrInputClass}`}
      />
    </FieldRow>
  );
}

function TextField({
  name,
  hint,
  value,
  maxLength,
  disabled,
  onChange,
}: {
  name: string;
  hint: string | undefined;
  value: string;
  maxLength: number | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { draft, edit, leave } = useDraft(
    value,
    () => true,
    (text) => onChange(text.trim()),
    null,
  );
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
    />
  );
}
