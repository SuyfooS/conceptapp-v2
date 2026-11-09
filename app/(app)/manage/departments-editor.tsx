"use client";

import {
  type DepartmentInput,
  departments as departmentsSchema,
  MAX_DEPARTMENTS,
  newDepartmentKey,
} from "@domain/departments";
import { AvatarStack } from "@ui/avatar";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { ArrowDown, ArrowUp, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import type { SettingsFailure, SettingsResult } from "./settings-types";
import { UndoRow } from "./undo-row";

const NAME_MAX = 40;

const rowClass =
  "relative flex min-h-[3.75rem] items-center gap-1 ps-4 pe-1.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
const inputClass =
  "min-h-11 w-full min-w-0 rounded-[10px] bg-transparent text-md text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent";

/** A department as the editor shows it: saved ones have their id. */
export type EditedDepartment = {
  id: string;
  key: string;
  name: string;
  members: string[];
};

export type DepartmentPeople = {
  userId: string;
  name: string | null;
  photo: string | null;
}[];

export type SaveDepartments = (
  departments: DepartmentInput[],
) => Promise<SettingsResult>;
export type SaveDepartmentMembers = (
  departmentId: string,
  members: string[],
) => Promise<SettingsResult>;

/**
 * The business's departments: each a name to type over, in their order, with
 * its people. Adding is the row at the end; removing has an undo, which
 * brings the department back with its people. Who is in a department saves at
 * once, from a sheet on a phone and beside the list from a tablet up, as a
 * grid on a computer. Used on /manage/departments and by the team in the
 * console.
 */
export function DepartmentsEditor({
  departments,
  people,
  disabled,
  save,
  saveMembers,
}: {
  departments: EditedDepartment[];
  people: DepartmentPeople;
  disabled: boolean;
  save: SaveDepartments;
  saveMembers: SaveDepartmentMembers;
}) {
  const t = useTranslations("app.manage.departments");
  const tm = useTranslations("app.manage");
  // What this screen saved last, in its order; the server's ids and people
  // join it by key.
  const [order, setOrder] = useState<DepartmentInput[] | null>(null);
  // The people this screen chose, by department, until the server agrees.
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");
  const [taken, setTaken] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{
    department: DepartmentInput;
    index: number;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [failure, setFailure] = useState<{
    reason: SettingsFailure;
    stamp: number;
  } | null>(null);
  const [saved, setSaved] = useState(0);

  const stored = new Map(departments.map((d) => [d.key, d]));
  const shown = (order ?? departments).map((d) => {
    const known = stored.get(d.key);
    return {
      key: d.key,
      name: d.name,
      id: known?.id ?? null,
      members: (known && chosen[known.id]) ?? known?.members ?? [],
    };
  });
  const current = shown.find((d) => d.key === selected) ?? shown[0] ?? null;
  const personOf = (userId: string) => people.find((p) => p.userId === userId);

  const named = (text: string, except?: string) =>
    shown.some(
      (d) => d.key !== except && d.name.toLowerCase() === text.toLowerCase(),
    );

  /** Saves the list; says whether it saved. */
  async function change(next: DepartmentInput[]): Promise<boolean> {
    if (!departmentsSchema.safeParse(next).success) return false;
    const before = order;
    setOrder(next);
    let result: SettingsResult;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      setSaved((count) => count + 1);
      return true;
    }
    setOrder(before);
    setFailure({ reason: result.failure, stamp: Date.now() });
    return false;
  }

  const plain = () => shown.map(({ key, name: n }) => ({ key, name: n }));

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = name.trim();
    if (!text) return;
    if (named(text)) {
      setTaken(text);
      return;
    }
    setName("");
    setTaken(null);
    if (await change([...plain(), { key: newDepartmentKey(), name: text }])) {
      setRemoved(null);
    } else {
      setName((typing) => typing || text);
    }
  }

  /** False when the name stays as it was. */
  function rename(key: string, before: string, text: string): boolean {
    const clean = text.trim();
    if (!clean || clean === before) return false;
    if (named(clean, key)) {
      setTaken(clean);
      return false;
    }
    setTaken(null);
    void change(
      plain().map((d) => (d.key === key ? { ...d, name: clean } : d)),
    );
    return true;
  }

  async function remove(index: number) {
    const all = plain();
    const department = all[index];
    if (!department) return;
    const before = removed;
    setRemoved({ department, index });
    if (!(await change(all.filter((_, at) => at !== index)))) {
      setRemoved(before);
    }
  }

  async function undo() {
    if (!removed) return;
    const { department, index } = removed;
    setRemoved(null);
    const all = plain();
    if (all.some((d) => d.key === department.key)) return;
    const next = [...all];
    next.splice(index, 0, department);
    if (!(await change(next))) setRemoved({ department, index });
  }

  function move(key: string, by: -1 | 1) {
    const all = plain();
    const at = all.findIndex((d) => d.key === key);
    const to = at + by;
    if (at < 0 || to < 0 || to >= all.length) return;
    const next = [...all];
    const [moving] = next.splice(at, 1);
    if (!moving) return;
    next.splice(to, 0, moving);
    void change(next);
  }

  async function toggle(departmentId: string, userId: string, on: boolean) {
    const department = shown.find((d) => d.id === departmentId);
    if (!department) return;
    const before = department.members;
    const next = on
      ? [...new Set([...before, userId])]
      : before.filter((id) => id !== userId);
    setChosen((all) => ({ ...all, [departmentId]: next }));
    let result: SettingsResult;
    try {
      result = await saveMembers(departmentId, next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      setSaved((count) => count + 1);
      return;
    }
    setChosen((all) => ({ ...all, [departmentId]: before }));
    setFailure({ reason: result.failure, stamp: Date.now() });
  }

  function openPeople(key: string) {
    setSelected(key);
    // The sheet is for a phone; from a tablet up the people sit beside the list.
    if (window.matchMedia("(max-width: 767px)").matches) setSheetOpen(true);
  }

  const peoplePanel = (department: (typeof shown)[number]) => {
    const index = shown.findIndex((d) => d.key === department.key);
    return (
      <div className="flex flex-col gap-3">
        {department.id === null ? (
          <p className="px-1 text-ink-2">{t("saving")}</p>
        ) : people.length === 0 ? (
          <p className="px-1 text-ink-2">{t("noPeople")}</p>
        ) : (
          // A grid on a computer: the first row's second person has no line
          // above it.
          <PersonList className="xl:grid xl:grid-cols-2 xl:[&>li:nth-child(2)]:before:hidden">
            {people.map((person) => {
              const inIt = department.members.includes(person.userId);
              const label = t("inDepartment", {
                name: person.name ?? t("noName"),
                department: department.name,
              });
              return (
                <PersonRow
                  key={person.userId}
                  name={person.name}
                  photo={person.photo}
                  title={person.name ?? t("noName")}
                  trailing={
                    <Switch
                      checked={inIt}
                      disabled={disabled}
                      aria-label={label}
                      title={label}
                      onChange={(on) => {
                        if (department.id) {
                          void toggle(department.id, person.userId, on);
                        }
                      }}
                    />
                  }
                />
              );
            })}
          </PersonList>
        )}
        {disabled ? null : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={index <= 0}
              onClick={() => move(department.key, -1)}
            >
              <ArrowUp aria-hidden="true" />
              {t("up")}
            </Button>
            <Button
              variant="secondary"
              disabled={index < 0 || index >= shown.length - 1}
              onClick={() => move(department.key, 1)}
            >
              <ArrowDown aria-hidden="true" />
              {t("down")}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <StatusToast
        message={saved > 0 ? tm("saved") : null}
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
          {tm(`failed.${failure.reason}`)}
        </Card>
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <PageSection title={t("listTitle")}>
          <ListGroup>
            {shown.length === 0 ? (
              <p className="px-4 py-3.5 text-ink-2">
                {t(disabled ? "emptyViewOnly" : "empty")}
              </p>
            ) : null}
            {shown.map((department, index) => {
              const faces = department.members.flatMap((id) => {
                const person = personOf(id);
                return person
                  ? [{ name: person.name ?? t("noName"), photo: person.photo }]
                  : [];
              });
              return (
                <div
                  key={department.key}
                  className={cn(
                    rowClass,
                    current?.key === department.key && "md:bg-surface-2/60",
                  )}
                >
                  <input
                    // Back to the stored name after a failed save.
                    key={department.name}
                    aria-label={t("nameOf", { name: department.name })}
                    defaultValue={department.name}
                    maxLength={NAME_MAX}
                    disabled={disabled}
                    className={inputClass}
                    onBlur={(event) => {
                      if (
                        !rename(
                          department.key,
                          department.name,
                          event.target.value,
                        )
                      ) {
                        event.target.value = department.name;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => openPeople(department.key)}
                    // Says what it shows first ("3 people in the kitchen").
                    aria-label={t("peopleIn", {
                      count: department.members.length,
                      name: department.name,
                    })}
                    className="pressable flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-ink-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {faces.length > 0 ? (
                      <AvatarStack people={faces} size="sm" max={3} />
                    ) : (
                      <Users aria-hidden="true" className="size-5" />
                    )}
                    <span className="whitespace-nowrap">
                      {t("people", { count: department.members.length })}
                    </span>
                  </button>
                  {disabled ? null : (
                    <IconButton
                      label={t("remove", { name: department.name })}
                      icon={<Trash2 />}
                      className="text-ink-2"
                      onClick={() => remove(index)}
                    />
                  )}
                </div>
              );
            })}
            {disabled || shown.length >= MAX_DEPARTMENTS ? null : (
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
              message={t("removed", { name: removed.department.name })}
              onUndo={undo}
            />
          ) : null}
          <p className="px-1 text-ink-2 text-sm">{t("hint")}</p>
        </PageSection>

        {current ? (
          <div className="hidden md:block">
            <PageSection title={t("peopleOf", { name: current.name })}>
              {peoplePanel(current)}
            </PageSection>
          </div>
        ) : null}
      </div>

      <Sheet
        open={sheetOpen && current !== null}
        onOpenChange={setSheetOpen}
        title={current ? t("peopleOf", { name: current.name }) : ""}
        closeLabel={t("close")}
      >
        <div className="px-2 pt-1 pb-2">
          {current ? peoplePanel(current) : null}
        </div>
      </Sheet>
    </>
  );
}
