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
import { arrived, focusFirst } from "@ui/focus-after";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { UndoRow } from "@ui/undo-row";
import { ArrowDown, ArrowUp, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { departmentName, movesOf, PEOPLE_BESIDE } from "./department-moves";
import { hairlineClass, inputClass, rowClass } from "./list-rows";
import type { SettingsFailure, SettingsResult } from "./settings-types";

const NAME_MAX = 40;

const besideNow = () => window.matchMedia(PEOPLE_BESIDE).matches;

function hearBeside(changed: () => void) {
  const query = window.matchMedia(PEOPLE_BESIDE);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/** A press on a department's people beside the list, by its key. */
type PeopleChoice = { readonly key: string };

/** Whether the people sit beside the list (`PEOPLE_BESIDE`); not on the server. */
function usePeopleBeside(): boolean {
  return useSyncExternalStore(hearBeside, besideNow, () => false);
}

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
 * grid on a computer; there the one shown is marked current, and a choice
 * puts the focus on its people's title. Enter saves a name with the focus
 * still in it, an add keeps it on "+", and "ביטול" gives it to the name
 * brought back. A save that fails is said by a line drawn anew each time,
 * gone once a save goes through. While taking orders is on, each says how many of the
 * menu's items it prepares, before it is removed and in its undo (waiter
 * mode P2). Used on /manage/departments and by the team in the console.
 */
export function DepartmentsEditor({
  departments,
  people,
  disabled,
  save,
  saveMembers,
  itemsByDepartment,
  on = { lists: true, menu: false },
}: {
  departments: EditedDepartment[];
  people: DepartmentPeople;
  disabled: boolean;
  save: SaveDepartments;
  saveMembers: SaveDepartmentMembers;
  /**
   * How many of the menu's items each department prepares, by its id, while
   * taking orders is on; none otherwise.
   */
  itemsByDepartment?: ReadonlyMap<string, number>;
  /** What reads the departments, for the hints under them: lists, the menu. */
  on?: { lists: boolean; menu: boolean };
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
    /** The menu's items it prepared, which go nowhere now. */
    items: number;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const beside = usePeopleBeside();
  // A choice of whose people beside the list: its panel's title takes the
  // focus, once per choice (`arrived`: each a new one, the same department
  // again too), so what was chosen is heard.
  const [chosePeople, setChosePeople] = useState<PeopleChoice | null>(null);
  const seenChoice = useRef<PeopleChoice | null>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!arrived(seenChoice, chosePeople)) return;
    focusFirst([panelTitle.current], { onlyIfLost: false, title: false });
  }, [chosePeople]);
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
  const prepares = (id: string | null) =>
    id ? (itemsByDepartment?.get(id) ?? 0) : 0;

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
      // A save went through: the last one that didn't is no longer so.
      setFailure(null);
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

  /**
   * The name typed in `field`, saved; false when the name stays as it was.
   * One that couldn't be saved is back to the stored name in its field,
   * unless something else was typed there meanwhile.
   */
  function rename(
    key: string,
    before: string,
    field: HTMLInputElement,
  ): boolean {
    const text = field.value;
    const clean = text.trim();
    if (!clean || clean === before) return false;
    if (named(clean, key)) {
      setTaken(clean);
      return false;
    }
    setTaken(null);
    void change(
      plain().map((d) => (d.key === key ? { ...d, name: clean } : d)),
    ).then((saved) => {
      if (!saved && field.value === text) field.value = before;
    });
    return true;
  }

  async function remove(index: number) {
    const all = plain();
    const department = all[index];
    if (!department) return;
    const before = removed;
    setRemoved({
      department,
      index,
      items: prepares(shown[index]?.id ?? null),
    });
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
    if (!(await change(next))) setRemoved(removed);
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
    // Its people stay shown while it moves: the first one's by default
    // would be another's once it is not first.
    setSelected(key);
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
      setFailure(null);
      setSaved((count) => count + 1);
      return;
    }
    setChosen((all) => ({ ...all, [departmentId]: before }));
    setFailure({ reason: result.failure, stamp: Date.now() });
  }

  function openPeople(key: string) {
    setSelected(key);
    // The sheet is for a phone; from a tablet up the people sit beside the
    // list, after it in reading order, and their title takes the focus.
    if (besideNow()) setChosePeople({ key });
    else setSheetOpen(true);
  }

  const peoplePanel = (department: (typeof shown)[number]) => {
    const index = shown.findIndex((d) => d.key === department.key);
    // At an end, a move is unavailable but still reached, so the focus stays
    // on it as its department arrives there.
    const can = movesOf(index, shown.length);
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
              aria-disabled={!can.up || undefined}
              onClick={() => {
                if (can.up) move(department.key, -1);
              }}
            >
              <ArrowUp aria-hidden="true" />
              {t("up")}
            </Button>
            <Button
              variant="secondary"
              aria-disabled={!can.down || undefined}
              onClick={() => {
                if (can.down) move(department.key, 1);
              }}
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
          // Drawn anew for each failure, so the same words again are heard.
          key={failure.stamp}
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 font-medium text-danger xl:top-4"
        >
          {tm(`failed.${failure.reason}`)}
        </Card>
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <PageSection title={t("listTitle")} headingRef={listTitle}>
          <ListGroup>
            {shown.length === 0 ? (
              <p className="px-4 py-3.5 text-ink-2">
                {/* What a department is for, as the subtitle says it. */}
                {t(
                  disabled
                    ? "emptyViewOnly"
                    : on.menu && !on.lists
                      ? "emptyMenu"
                      : "empty",
                )}
              </p>
            ) : null}
            {shown.map((department, index) => {
              const faces = department.members.flatMap((id) => {
                const person = personOf(id);
                return person
                  ? [{ name: person.name ?? t("noName"), photo: person.photo }]
                  : [];
              });
              const items = prepares(department.id);
              return (
                <div
                  key={department.key}
                  className={cn(
                    hairlineClass,
                    "ps-4 pe-1.5",
                    current?.key === department.key && "md:bg-surface-2/60",
                  )}
                >
                  <div className="flex min-h-[3.75rem] items-center gap-1">
                    <input
                      // The same field while its name changes, so Enter
                      // saves it with the focus still there; `rename` puts
                      // the stored name back after a failed save.
                      key={department.key}
                      aria-label={t("nameOf", { name: department.name })}
                      defaultValue={department.name}
                      maxLength={NAME_MAX}
                      disabled={disabled}
                      className={inputClass}
                      // Found again by its department once "ביטול" brings it
                      // back (`departmentName`).
                      data-department-name={department.key}
                      onBlur={(event) => {
                        const input = event.currentTarget;
                        if (!rename(department.key, department.name, input)) {
                          input.value = department.name;
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const input = event.currentTarget;
                        if (!rename(department.key, department.name, input)) {
                          input.value = department.name;
                        }
                      }}
                    />
                    {/*
                     * Named by what it shows, then the department, for a
                     * screen reader only ("3 אנשים במטבח"). The faces are
                     * pictures, hidden, so their initials stay out of the name.
                     */}
                    <button
                      type="button"
                      // Beside the list, whose people are shown is said, not
                      // only tinted.
                      aria-current={
                        beside && current?.key === department.key
                          ? "true"
                          : undefined
                      }
                      onClick={() => openPeople(department.key)}
                      className="pressable relative flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-ink-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {faces.length > 0 ? (
                        <AvatarStack people={faces} size="sm" max={3} />
                      ) : (
                        <Users aria-hidden="true" className="size-5" />
                      )}
                      <span className="whitespace-nowrap">
                        {t("people", { count: department.members.length })}
                      </span>
                      <span className="sr-only">
                        {" "}
                        {t("peopleWhere", { name: department.name })}
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
                  {/* Said before it is removed: what it prepares goes nowhere then. */}
                  {items > 0 ? (
                    <p className="-mt-1.5 pb-2.5 text-ink-2 text-sm">
                      {t("menuItems", { count: items })}
                    </p>
                  ) : null}
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
                  // Unavailable with no name, and still reached: an add
                  // empties the name under the focus, which stays here.
                  aria-disabled={!name.trim() || undefined}
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
              // Each removal a row of its own: another while this one is up
              // takes the focus again.
              key={removed.department.key}
              message={
                removed.items > 0
                  ? t("removedMenu", {
                      name: removed.department.name,
                      count: removed.items,
                    })
                  : t("removed", { name: removed.department.name })
              }
              onUndo={undo}
              // The row went with the button pressed.
              autoFocus
              // Undone, the department's name is back where it was.
              focusAfter={() => [
                departmentName(removed.department.key),
                listTitle.current,
              ]}
            />
          ) : null}
          {on.lists ? (
            <p className="px-1 text-ink-2 text-sm">{t("hint")}</p>
          ) : null}
          {on.menu ? (
            <p className="px-1 text-ink-2 text-sm">{t("hintMenu")}</p>
          ) : null}
        </PageSection>

        {current ? (
          <div className="hidden md:block">
            <PageSection
              title={t("peopleOf", { name: current.name })}
              headingRef={panelTitle}
            >
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
