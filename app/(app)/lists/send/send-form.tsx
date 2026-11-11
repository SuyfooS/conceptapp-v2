"use client";

import { addDays, dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  type DraftItem,
  type DueDay,
  dueAtOf,
  dueTimeFor,
  listName,
  MAX_QUANTITY,
  parseQuantity,
  quantitiesOf,
  type RecipientKind,
  type SendInput,
  sendDefaults,
  suggestedDue,
  typedItems,
} from "@domain/lists";
import type { StaffRole } from "@domain/modules";
import { Avatar } from "@ui/avatar";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { Stepper } from "@ui/stepper";
import { ltrInputClass, TextArea } from "@ui/text-field";
import {
  Building2,
  CalendarClock,
  ListPlus,
  Send,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState, useTransition } from "react";
import { ListPreview } from "../list-preview";
import {
  type ListFailure,
  NEW_LIST,
  type SendFormData,
  type SendResult,
} from "../list-types";
import { ItemsEditor } from "../templates/items-editor";

type Kind = RecipientKind;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** An order's usual counts, as its steppers start (L5). */
const usualCounts = (template: SendFormData["templates"][number] | undefined) =>
  Object.fromEntries(
    (template?.quantities ?? []).map((item) => [
      item.id,
      item.usual === null ? "" : String(item.usual),
    ]),
  );

/**
 * Sending a list now: which list (a template, or one typed now with its own
 * items), to whom (a person, a department, the people of a published shift
 * or a role), by when if at all, and a note. A template starts where it goes
 * (`sendDefaults`), and says so when its department was removed. A
 * department's members send their own order, which goes where the order
 * goes, and can't once that department is gone. The main action names where
 * it goes ("send to the kitchen"). Phone: the form, one part under the other.
 * Tablet: the form beside the list as it will arrive. Desktop: the same, and
 * what the person sent today (`sentToday`). Also on /design/shell/lists/send.
 */
export function SendForm({
  data,
  send,
  paths,
  sentToday,
}: {
  data: SendFormData;
  send: (input: SendInput) => Promise<SendResult>;
  paths: { lists: string };
  /** What the person sent today, drawn on the server; on a computer only. */
  sentToday?: ReactNode;
}) {
  const t = useTranslations("app.lists.send");
  const tDays = useTranslations("days");
  const router = useRouter();
  const id = useId();
  const [source, setSource] = useState(data.initial);
  const template = data.templates.find((x) => x.id === source);
  const typed = source === NEW_LIST;
  const liveDepartments = data.departments.map((d) => d.id);
  const start = sendDefaults(template?.recipient, data.shifts, liveDepartments);
  const [kind, setKind] = useState<Kind>(start.kind);
  const [person, setPerson] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(start.department);
  const [shift, setShift] = useState<string | null>(start.shift);
  const [role, setRole] = useState<StaffRole | null>(start.role);
  const [ownName, setOwnName] = useState("");
  const [ownItems, setOwnItems] = useState<DraftItem[]>([]);
  const [dueDay, setDueDay] = useState<DueDay>("none");
  const [dueTime, setDueTime] = useState(
    () => suggestedDue(new Date(data.now), data.timeZone).time,
  );
  // Until the person sets a time, each day starts at its own (`dueTimeFor`).
  const [timeSet, setTimeSet] = useState(false);
  const [duePast, setDuePast] = useState(false);
  const [note, setNote] = useState("");
  // An order's counts, as typed, by the template's item.
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    usualCounts(template),
  );
  // The items whose count typed isn't one, until each is changed.
  const [wrongCounts, setWrongCounts] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [failure, setFailure] = useState<ListFailure | null>(null);
  const [pending, startSend] = useTransition();

  // The template's own department was removed: nothing chosen, and said.
  const departmentGone = !typed && start.gone;

  // An order goes where the order goes, for whoever may only send orders,
  // and nowhere once that department is gone.
  const orderTo =
    !data.free && template?.recipient?.kind === "department"
      ? template.recipient.department
      : null;
  const fixed = orderTo !== null && !start.gone ? orderTo : null;
  const orderGone = orderTo !== null && fixed === null;

  function choose(next: string) {
    setSource(next);
    setFailure(null);
    const chosen = data.templates.find((x) => x.id === next);
    setCounts(usualCounts(chosen));
    setWrongCounts(new Set());
    const defaults = sendDefaults(
      chosen?.recipient,
      data.shifts,
      liveDepartments,
    );
    setKind(defaults.kind);
    setDepartment(defaults.department);
    setShift(defaults.shift);
    setRole(defaults.role);
  }

  /** Whether the due time chosen has gone by, by this device's clock now. */
  function checkDue(day: DueDay, time: string) {
    setDuePast(
      day !== "none" &&
        !dueAtOf(day, time, new Date(), data.timeZone).ok &&
        time !== "",
    );
  }

  const departmentName = (key: string | null) =>
    data.departments.find((d) => d.id === key)?.name ?? null;
  const personName = (key: string | null) =>
    data.people.find((p) => p.userId === key)?.name ?? t("noName");
  const shiftOf = (key: string | null) =>
    data.shifts?.find((s) => s.id === key) ?? null;

  const dayOf = (day: string) => {
    const today = dateIn(new Date(data.now), data.timeZone);
    if (day === today) return t("today");
    if (day === addDays(today, 1)) return t("tomorrow");
    return `${tDays(`${WEEKDAY_KEYS[weekdayOf(day)] ?? "sun"}.long`)} ${dayMonth(day)}`;
  };

  const recipient: SendInput["recipient"] | null = fixed
    ? { kind: "department", department: fixed }
    : orderGone
      ? null
      : kind === "person" && person
        ? { kind: "person", user: person }
        : kind === "department" && department
          ? { kind: "department", department }
          : kind === "shift" && shift
            ? { kind: "shift", shift }
            : kind === "role" && role
              ? { kind: "role", role }
              : null;

  const typedReady =
    !typed || (listName.safeParse(ownName).success && ownItems.length > 0);

  const submitLabel = orderGone
    ? t("action")
    : !recipient
      ? t("choose")
      : recipient.kind === "person"
        ? t("submit.person", { name: personName(recipient.user) })
        : recipient.kind === "department"
          ? t("submit.department", {
              name: departmentName(recipient.department) ?? "",
            })
          : recipient.kind === "shift"
            ? t("submit.shift", { name: shiftOf(recipient.shift)?.name ?? "" })
            : t("submit.role", { role: recipient.role });

  function submit() {
    if (!recipient || !typedReady || (!typed && !template)) return;
    let dueAt: string | null = null;
    if (dueDay !== "none") {
      const due = dueAtOf(dueDay, dueTime, new Date(), data.timeZone);
      if (!due.ok) {
        setDuePast(true);
        return;
      }
      dueAt = due.dueAt;
    }
    setFailure(null);
    // An order's counts: those typed, and the usual ones for the rest.
    const asked: ReturnType<typeof quantitiesOf> =
      !typed && template && template.quantities.length > 0
        ? quantitiesOf(
            template.quantities.map((item) => ({
              id: item.id,
              kind: "check" as const,
            })),
            counts,
          )
        : { ok: true, counts: {} };
    if (!asked.ok) {
      setWrongCounts(new Set(asked.invalid));
      return;
    }
    const text = note.trim();
    const extra = {
      recipient,
      ...(dueAt ? { dueAt } : {}),
      ...(text ? { note: text } : {}),
    };
    const input: SendInput =
      typed || !template
        ? { name: ownName.trim(), items: typedItems(ownItems), ...extra }
        : {
            template: template.id,
            ...extra,
            ...(Object.keys(asked.counts).length > 0
              ? { quantities: asked.counts }
              : {}),
          };
    startSend(async () => {
      let result: SendResult;
      try {
        result = await send(input);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setFailure(result.failure);
        return;
      }
      router.push(`${paths.lists}?sent=${result.value}`);
    });
  }

  const kinds: Kind[] = [
    "person",
    "department",
    ...(data.shifts !== null ? (["shift"] as const) : []),
    "role",
  ];

  /**
   * How many an order's check will ask for, as the preview shows it: the
   * count typed, the usual one while its field is empty (as `send_list` takes
   * it), and none while what is typed isn't a count.
   */
  const requestedOf = (itemId: string): number | null => {
    const asked = template?.quantities.find((item) => item.id === itemId);
    if (typed || !asked) return null;
    const text = counts[itemId] ?? "";
    return text.trim() === "" ? asked.usual : parseQuantity(text);
  };

  const preview = typed
    ? {
        name: ownName.trim() || t("newList"),
        note: note.trim() || null,
        items: ownItems,
      }
    : template
      ? {
          name: template.name,
          note: [template.note, note.trim()].filter(Boolean).join("\n") || null,
          items: template.items.map((item) => ({
            ...item,
            requested: requestedOf(item.id),
          })),
        }
      : null;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.lists, label: t("back") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <ChoiceList legend={t("which")}>
            {data.templates.map((x) => (
              <ChoiceRow
                key={x.id}
                name="template"
                value={x.id}
                checked={x.id === source}
                onChange={() => choose(x.id)}
                title={x.name}
                hint={t("items", { count: x.items.length })}
              />
            ))}
            {data.free ? (
              <ChoiceRow
                name="template"
                value={NEW_LIST}
                checked={typed}
                onChange={() => choose(NEW_LIST)}
                title={t("newList")}
                hint={t("newListHint")}
                leading={<ListPlus />}
              />
            ) : null}
          </ChoiceList>

          {typed ? (
            <section className="flex flex-col gap-6">
              <PageSection title={t("typed")}>
                <FieldGroup>
                  <GroupedField
                    label={t("typedName")}
                    value={ownName}
                    maxLength={60}
                    onChange={(event) => {
                      setOwnName(event.target.value);
                      setFailure(null);
                    }}
                  />
                </FieldGroup>
              </PageSection>
              <ItemsEditor
                title={t("typedItems")}
                items={ownItems}
                readOnly={false}
                onChange={(items) => {
                  setOwnItems(items);
                  setFailure(null);
                }}
              />
            </section>
          ) : null}

          {fixed || orderGone ? (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("to")}</h2>
              <Card
                tone="flat"
                padding="lg"
                role={orderGone ? "status" : undefined}
                className={orderGone ? "font-medium" : undefined}
              >
                {fixed
                  ? t("fixedTo", { name: departmentName(fixed) ?? "" })
                  : t("orderGone")}
              </Card>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("to")}</h2>
              {departmentGone && !recipient ? (
                <p role="status" className="px-1 font-medium">
                  {t("gone")}
                </p>
              ) : null}
              <Segmented
                label={t("to")}
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  setFailure(null);
                }}
                options={kinds.map((value) => ({
                  value,
                  label: t(`kinds.${value}`),
                }))}
              />
              {kind === "person" ? (
                <ChoiceList
                  legend={t("kinds.person")}
                  legendClassName="sr-only"
                >
                  {data.people.map((p) => (
                    <ChoiceRow
                      key={p.userId}
                      name="person"
                      value={p.userId}
                      checked={person === p.userId}
                      onChange={() => setPerson(p.userId)}
                      title={p.name ?? t("noName")}
                      leading={
                        p.name ? (
                          <Avatar name={p.name} photo={p.photo} />
                        ) : (
                          <UserRound />
                        )
                      }
                    />
                  ))}
                </ChoiceList>
              ) : kind === "department" ? (
                data.departments.length > 0 ? (
                  <ChoiceList
                    legend={t("kinds.department")}
                    legendClassName="sr-only"
                  >
                    {data.departments.map((d) => (
                      <ChoiceRow
                        key={d.id}
                        name="department"
                        value={d.id}
                        checked={department === d.id}
                        onChange={() => setDepartment(d.id)}
                        title={d.name}
                        leading={<Building2 />}
                      />
                    ))}
                  </ChoiceList>
                ) : (
                  <p className="px-1 text-ink-2">{t("noDepartments")}</p>
                )
              ) : kind === "shift" ? (
                data.shifts && data.shifts.length > 0 ? (
                  <ChoiceList
                    legend={t("kinds.shift")}
                    legendClassName="sr-only"
                  >
                    {data.shifts.map((s) => (
                      <ChoiceRow
                        key={s.id}
                        name="shift"
                        value={s.id}
                        checked={shift === s.id}
                        disabled={s.people.length === 0}
                        onChange={() => setShift(s.id)}
                        title={s.name}
                        hint={t.rich("shiftHint", {
                          day: dayOf(s.day),
                          start: s.start,
                          end: s.end,
                          count: s.people.length,
                          ltr,
                        })}
                        leading={<CalendarClock />}
                        // Its hint says nobody is on it; it reads as the
                        // others do, and takes no press.
                        className={cn(
                          s.people.length === 0 && "cursor-default",
                        )}
                      />
                    ))}
                  </ChoiceList>
                ) : (
                  <p className="px-1 text-ink-2">{t("noShifts")}</p>
                )
              ) : (
                <ChoiceList legend={t("kinds.role")} legendClassName="sr-only">
                  {data.roles.map((r) => (
                    <ChoiceRow
                      key={r}
                      name="role"
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                      title={t(`roles.${r}`)}
                    />
                  ))}
                </ChoiceList>
              )}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="px-1 font-bold text-lg">{t("when")}</h2>
            <Segmented
              label={t("when")}
              value={dueDay}
              onChange={(next) => {
                const time =
                  next === "none" || timeSet
                    ? dueTime
                    : dueTimeFor(next, new Date(), data.timeZone);
                setDueDay(next);
                setDueTime(time);
                checkDue(next, time);
              }}
              options={(["none", "today", "tomorrow"] as const).map(
                (value) => ({ value, label: t(`dueDays.${value}`) }),
              )}
            />
            {dueDay === "none" ? (
              <p className="px-1 text-ink-2 text-sm">{t("noDueHint")}</p>
            ) : (
              <FieldGroup>
                <FieldRow
                  label={t("dueTime")}
                  htmlFor={`${id}-due`}
                  hint={t("dueHint")}
                >
                  <input
                    id={`${id}-due`}
                    type="time"
                    dir="ltr"
                    value={dueTime}
                    aria-invalid={duePast || undefined}
                    aria-describedby={duePast ? `${id}-past` : undefined}
                    className={cn(rowPillInputClass, ltrInputClass)}
                    onChange={(event) => {
                      setDueTime(event.target.value);
                      setTimeSet(true);
                      checkDue(dueDay, event.target.value);
                    }}
                  />
                </FieldRow>
              </FieldGroup>
            )}
            {duePast && dueDay !== "none" ? (
              <p
                id={`${id}-past`}
                role="alert"
                className="px-1 font-medium text-danger text-sm"
              >
                {t("duePast")}
              </p>
            ) : null}
          </section>

          {!typed && template && template.quantities.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("quantities")}</h2>
              <FieldGroup>
                {template.quantities.map((item) => {
                  const wrong = wrongCounts.has(item.id);
                  return (
                    <FieldRow
                      key={item.id}
                      label={item.label}
                      htmlFor={`${id}-count-${item.id}`}
                    >
                      <Stepper
                        id={`${id}-count-${item.id}`}
                        value={counts[item.id] ?? ""}
                        min={0}
                        max={MAX_QUANTITY}
                        wide
                        label={t("quantityOf", { label: item.label })}
                        invalid={wrong || undefined}
                        describedBy={
                          wrong ? `${id}-count-${item.id}-wrong` : undefined
                        }
                        decreaseLabel={t("fewer", { label: item.label })}
                        increaseLabel={t("more", { label: item.label })}
                        onValueChange={(value) => {
                          setCounts((current) => ({
                            ...current,
                            [item.id]: value,
                          }));
                          // Only this one's word goes; the others' stay.
                          setWrongCounts((current) => {
                            if (!current.has(item.id)) return current;
                            const next = new Set(current);
                            next.delete(item.id);
                            return next;
                          });
                        }}
                      />
                    </FieldRow>
                  );
                })}
              </FieldGroup>
              {wrongCounts.size > 0 ? (
                // One line for each count that isn't one, named by its item.
                <div role="alert" className="flex flex-col gap-1 px-1">
                  {template.quantities
                    .filter((item) => wrongCounts.has(item.id))
                    .map((item) => (
                      <p
                        key={item.id}
                        id={`${id}-count-${item.id}-wrong`}
                        className="font-medium text-danger text-sm"
                      >
                        {t("quantityInvalidOf", { label: item.label })}
                      </p>
                    ))}
                </div>
              ) : (
                <p className="px-1 text-ink-2 text-sm">{t("quantitiesHint")}</p>
              )}
            </section>
          ) : null}

          <TextArea
            label={t("note")}
            hint={t("noteHint")}
            value={note}
            maxLength={300}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />

          {typed && !typedReady ? (
            <p className="px-1 text-ink-2">{t("typedMissing")}</p>
          ) : null}
          {failure ? (
            <p role="alert" className="px-1 font-medium text-danger">
              {t(`failed.${failure}`)}
            </p>
          ) : null}

          <FloatingAction>
            <Button
              size="lg"
              loading={pending}
              disabled={!recipient || !typedReady}
              onClick={submit}
              className={`w-full md:w-auto ${floatingButtonClass}`}
            >
              <Send aria-hidden="true" />
              {submitLabel}
            </Button>
          </FloatingAction>
        </div>

        <aside
          aria-label={t("preview")}
          className="hidden min-w-0 flex-col gap-8 md:flex"
        >
          {preview ? (
            <div className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("preview")}</h2>
              <ListPreview
                name={preview.name}
                note={preview.note}
                items={preview.items}
              />
            </div>
          ) : null}
          {sentToday ? (
            <div className="hidden xl:flex xl:flex-col">{sentToday}</div>
          ) : null}
        </aside>
      </div>
    </PageBody>
  );
}
