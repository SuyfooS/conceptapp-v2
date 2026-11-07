"use client";

import {
  newStaffingKey,
  type Position,
  positions as positionsSchema,
} from "@domain/staffing";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { UndoRow } from "./undo-row";

const NAME_MAX = 40;
const POSITIONS_MAX = 30;

const rowClass =
  "relative flex min-h-[3.25rem] items-center gap-1 ps-4 pe-1.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
const inputClass =
  "min-h-11 w-full min-w-0 rounded-[10px] bg-transparent text-md text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent";

/**
 * The jobs people do at this business, in its own words. Each is a name to type
 * over, and a person keeps their shift when the job they had on it goes. Whatever
 * doesn't save comes back as it was, with the way back still there.
 */
export function PositionsEditor({
  title,
  hint,
  positions,
  disabled,
  onChange,
}: {
  title: string;
  hint: string | undefined;
  positions: Position[];
  disabled: boolean;
  /** Saves the list; says whether it saved. */
  onChange: (next: Position[]) => Promise<boolean>;
}) {
  const t = useTranslations("app.manage.positions");
  const [name, setName] = useState("");
  // The name someone tried that another position already has.
  const [taken, setTaken] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{
    position: Position;
    index: number;
  } | null>(null);

  const named = (text: string, except?: string) =>
    positions.some(
      (position) =>
        position.key !== except &&
        position.name.toLowerCase() === text.toLowerCase(),
    );

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = name.trim();
    if (!text) return;
    if (named(text)) {
      setTaken(text);
      return;
    }
    const next = [
      ...positions,
      { key: newStaffingKey("position"), name: text },
    ];
    if (!positionsSchema.safeParse(next).success) return;
    setName("");
    setTaken(null);
    if (await onChange(next)) setRemoved(null);
    else setName((current) => current || text);
  }

  /** False when the name stays as it was. */
  function rename(position: Position, text: string): boolean {
    const clean = text.trim();
    if (!clean || clean === position.name) return false;
    if (named(clean, position.key)) {
      setTaken(clean);
      return false;
    }
    setTaken(null);
    void onChange(
      positions.map((other) =>
        other.key === position.key ? { ...other, name: clean } : other,
      ),
    );
    return true;
  }

  async function remove(index: number) {
    const position = positions[index];
    if (!position) return;
    const before = removed;
    setRemoved({ position, index });
    const saved = await onChange(positions.filter((_, at) => at !== index));
    if (!saved) setRemoved(before);
  }

  async function undo() {
    if (!removed) return;
    const { position, index } = removed;
    setRemoved(null);
    if (positions.some((other) => other.key === position.key)) return;
    const next = [...positions];
    next.splice(index, 0, position);
    if (!(await onChange(next))) setRemoved({ position, index });
  }

  return (
    <PageSection title={title}>
      <ListGroup>
        {positions.length === 0 ? (
          <p className="px-4 py-3.5 text-ink-2">
            {t(disabled ? "emptyViewOnly" : "empty")}
          </p>
        ) : null}
        {positions.map((position, index) => (
          <div key={position.key} className={rowClass}>
            <input
              // Back to the stored name after a failed save.
              key={position.name}
              aria-label={t("nameOf", { name: position.name })}
              defaultValue={position.name}
              maxLength={NAME_MAX}
              disabled={disabled}
              className={inputClass}
              onBlur={(event) => {
                if (!rename(position, event.target.value)) {
                  event.target.value = position.name;
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            {disabled ? null : (
              <IconButton
                label={t("remove", { name: position.name })}
                icon={<Trash2 />}
                className="text-ink-2"
                onClick={() => remove(index)}
              />
            )}
          </div>
        ))}
        {disabled || positions.length >= POSITIONS_MAX ? null : (
          <form onSubmit={add} className={rowClass}>
            <input
              aria-label={t("newName")}
              placeholder={t("newName")}
              value={name}
              maxLength={NAME_MAX}
              aria-invalid={taken !== null || undefined}
              className={inputClass}
              onChange={(event) => {
                setName(event.target.value);
                setTaken(null);
              }}
            />
            <IconButton
              type="submit"
              label={t("add")}
              icon={<Plus />}
              variant="secondary"
              disabled={!name.trim()}
            />
          </form>
        )}
      </ListGroup>
      {taken ? (
        <p role="alert" className="px-1 text-danger text-sm">
          {t("taken", { name: taken })}
        </p>
      ) : null}
      {removed ? (
        <UndoRow
          message={t("removed", { name: removed.position.name })}
          onUndo={undo}
        />
      ) : null}
      {hint ? <p className="px-1 text-ink-2 text-sm">{hint}</p> : null}
    </PageSection>
  );
}
