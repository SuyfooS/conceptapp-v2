"use client";

import type { ScheduleOpenings } from "@domain/list-openings";
import {
  type DraftItem,
  type DraftSchedule,
  draftItemsOf,
  draftSchedulesOf,
  itemsForSave,
  listName,
  recipientGone,
  scheduleGone,
  schedulesForSave,
  type TemplateRecipient,
  templateDraftProblem,
  templateInputOf,
  templateStuck,
} from "@domain/lists";
import type { StaffRole } from "@domain/modules";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldGroup, GroupedField, GroupedTextArea } from "@ui/field-group";
import { FieldRow } from "@ui/field-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { StatusToast } from "@ui/status-toast";
import { Send, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { TYPING_MS } from "../../manage/use-draft";
import { ListPreview } from "../list-preview";
import type {
  ListFailure,
  TemplateActions,
  TemplateEditorData,
  TemplatePaths,
} from "../list-types";
import { ItemsEditor } from "./items-editor";
import { SchedulesEditor } from "./schedules-editor";

const NAME_MAX = 60;
const NOTE_MAX = 300;

/** What the editor changes: the rest of a template goes back as it was read. */
type Draft = {
  name: string;
  note: string;
  recipient: TemplateRecipient | null;
  items: DraftItem[];
  schedules: DraftSchedule[];
};

/** A time as it would be stored, without what only this screen or the database keeps. */
const scheduleMark = ({
  key: _key,
  id: _id,
  startsOn: _starts,
  opensFrom: _from,
  ...schedule
}: DraftSchedule) => JSON.stringify(schedule);

type RecipientKind = "none" | TemplateRecipient["kind"];

/** A draft as it would be stored, without ids: equal ones need no save. */
const signature = (draft: Draft) =>
  JSON.stringify({
    name: draft.name.trim(),
    note: draft.note.trim(),
    recipient: draft.recipient,
    items: draft.items.map(({ key: _key, id: _id, ...item }) => item),
    schedules: draft.schedules.map(scheduleMark),
  });

type SaveOutcome = "saved" | "unchanged" | "invalid" | "failed";

/**
 * Why a save didn't happen, in words: the database's, or "createUnknown", a
 * new template whose save may have gone through without its answer, after
 * which nothing more saves here, so it is never made twice.
 */
type Failure = ListFailure | "createUnknown";

/**
 * A template's editor. It saves itself on every change, as /manage does: a
 * tap at once, typing shortly after it stops or on leaving the field, one
 * save at a time and the newest last, each with the version it read, so a
 * save behind someone else's is refused (40001) and the screen opens again
 * with the latest, saying so once. A new template is saved once it has a
 * name and an item. One the database would refuse whatever is done here
 * (`templateStuck`: an order whose department was removed) is only read,
 * says why, and can still be removed or sent; a time that points at
 * something gone says so on its row, and on top that it holds the saves
 * until it is changed or removed, with the way to it (L4). Its times say
 * when each is sent next, as the database will open it. Phone: the sections
 * one under the other. Tablet and desktop: the editor beside the list as it
 * will arrive. The main action sends it now;
 * removing it has its undo on the screen of templates. Used on
 * /lists/templates/[id] and by the team in the console.
 */
export function TemplateEditor({
  data,
  actions,
  paths,
}: {
  data: TemplateEditorData;
  actions: TemplateActions;
  paths: TemplatePaths;
}) {
  const t = useTranslations("app.lists.templates");
  const te = useTranslations("app.lists.templates.editor");
  const ts = useTranslations("app.lists.send");
  const tm = useTranslations("app.manage");
  const router = useRouter();
  const { template, readOnly } = data;
  const order = template?.fromDepartment ?? null;
  const liveDepartments = data.departments.map((d) => d.id);
  const shiftKeys = data.shifts.map((s) => s.key);
  const gone = template
    ? recipientGone(template.recipient, liveDepartments, shiftKeys)
    : false;
  const stuck =
    template && !readOnly ? templateStuck(template, liveDepartments) : null;
  const places = { departments: liveDepartments, shifts: shiftKeys };
  // Nothing here changes: a view session, a removed template, or a stuck one.
  const locked = readOnly || stuck !== null;

  const initial: Draft = {
    name: template?.name ?? "",
    note: template?.note ?? "",
    // One that is gone can't be saved again: the person chooses another.
    recipient: gone && !locked ? null : (template?.recipient ?? null),
    items: draftItemsOf(template?.items ?? []),
    schedules: draftSchedulesOf(template?.schedules ?? []),
  };
  const [shown, setShown] = useState(initial);
  // The saved times' next openings, while what is saved is what shows.
  const [openings, setOpenings] = useState<ScheduleOpenings>(
    data.times.openings,
  );
  const [savedId, setSavedId] = useState(template?.id ?? null);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(0);
  const [failure, setFailure] = useState<{
    reason: Failure;
    stamp: number;
  } | null>(null);
  // "Changed on another screen" until the next save goes through.
  const [changedShown, setChangedShown] = useState(data.changed);
  const [sending, setSending] = useState(false);
  const [archiving, startArchive] = useTransition();
  // Asks the times to open the first one that points at something gone.
  const [fixGone, setFixGone] = useState(0);
  const heldCard = useRef<HTMLDivElement>(null);

  // The newest draft, what the database has, and the save in flight: read by
  // the saves, which outlive the render that started them.
  const draft = useRef(initial);
  const server = useRef({
    id: template?.id ?? null,
    version: template?.version ?? null,
    items: new Set(template?.items.map((item) => item.id) ?? []),
    schedules: new Set(template?.schedules.map((s) => s.id) ?? []),
  });
  const lastSaved = useRef<string | null>(
    template
      ? signature({ ...initial, recipient: template.recipient ?? null })
      : null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<SaveOutcome> | null>(null);
  const again = useRef(false);
  const stopped = useRef(locked);

  function inputOf(snapshot: Draft) {
    return templateInputOf(
      {
        id: server.current.id,
        fromDepartment: template?.fromDepartment ?? null,
        asksQuantities: template?.asksQuantities ?? false,
        schedules: template?.schedules ?? [],
      },
      {
        name: snapshot.name,
        note: snapshot.note,
        recipient: snapshot.recipient,
        items: itemsForSave(snapshot.items, server.current.items),
        schedules: schedulesForSave(
          snapshot.schedules,
          server.current.schedules,
        ),
      },
    );
  }

  function refused(reason: ListFailure) {
    setFailure({ reason, stamp: Date.now() });
    if (reason === "changed" && server.current.id) {
      // Someone saved in between: the screen opens again with the latest.
      stopped.current = true;
      router.replace(
        `${paths.list}/${server.current.id}?changed=${Date.now()}`,
      );
    } else if (reason === "finished" || reason === "businessChanged") {
      // Removed elsewhere, or another business now: nothing more saves here.
      stopped.current = true;
    }
  }

  async function saveOnce(): Promise<SaveOutcome> {
    if (stopped.current) return "failed";
    const snapshot = draft.current;
    const mark = signature(snapshot);
    if (mark === lastSaved.current) return "unchanged";
    if (templateDraftProblem(snapshot, order, places) !== null) {
      return "invalid";
    }
    const input = inputOf(snapshot);
    let result: Awaited<ReturnType<TemplateActions["save"]>>;
    try {
      result = await actions.save(input, server.current.version);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (!result.ok) {
      if (
        server.current.id === null &&
        (result.saved !== undefined ||
          result.failure === "failed" ||
          result.failure === "changed")
      ) {
        // A new one the database may have made, or did: nothing more saves
        // here, so it is never made twice. When its id came back, its own
        // screen opens with what was stored.
        stopped.current = true;
        setFailure({ reason: "createUnknown", stamp: Date.now() });
        if (result.saved) router.replace(`${paths.list}/${result.saved}`);
        return "failed";
      }
      refused(result.failure);
      return "failed";
    }
    const value = result.value;
    if (
      value.items.length !== snapshot.items.length ||
      value.schedules.length !== snapshot.schedules.length
    ) {
      if (server.current.id === null) {
        // Made, though not as sent: its own screen, never made again.
        stopped.current = true;
        router.replace(`${paths.list}/${value.id}?changed=${Date.now()}`);
        return "failed";
      }
      refused("changed");
      return "failed";
    }
    const created = server.current.id === null;
    server.current = {
      id: value.id,
      version: value.version,
      items: new Set(value.items),
      schedules: new Set(value.schedules),
    };
    // The items it saved get their ids, wherever they are now.
    const ids = new Map(
      snapshot.items.map((item, at) => [item.key, value.items[at] ?? null]),
    );
    // And so do its times. One new, or given other days or hours here,
    // counts from this save, as the database has it, while it is still what
    // was saved.
    const scheduleIds = new Map(
      snapshot.schedules.map((schedule, at) => [
        schedule.key,
        value.schedules[at] ?? null,
      ]),
    );
    const savedAt = new Date().toISOString();
    draft.current = {
      ...draft.current,
      items: draft.current.items.map((item) =>
        ids.has(item.key)
          ? { ...item, id: ids.get(item.key) ?? item.id }
          : item,
      ),
      schedules: draft.current.schedules.map((schedule) => {
        const storedId = scheduleIds.get(schedule.key);
        if (!storedId) return schedule;
        const sent = snapshot.schedules.find((s) => s.key === schedule.key);
        const asSent =
          sent !== undefined && scheduleMark(sent) === scheduleMark(schedule);
        return storedId === schedule.id &&
          (schedule.opensFrom !== null || !asSent)
          ? schedule
          : {
              ...schedule,
              id: storedId,
              opensFrom: schedule.opensFrom ?? (asSent ? savedAt : null),
            };
      }),
    };
    // What was saved now is what shows, unless it changed meanwhile.
    const unchanged = new Set(
      draft.current.schedules
        .filter((schedule) => {
          const sent = snapshot.schedules.find((s) => s.key === schedule.key);
          return sent && scheduleMark(sent) === scheduleMark(schedule);
        })
        .flatMap((schedule) => (schedule.id ? [schedule.id] : [])),
    );
    setOpenings(
      Object.fromEntries(
        Object.entries(value.openings).filter(([id]) => unchanged.has(id)),
      ),
    );
    lastSaved.current = mark;
    setShown(draft.current);
    setSavedId(value.id);
    setFailure(null);
    setChangedShown(false);
    setSaved((count) => count + 1);
    if (created) {
      // Its own address now, without drawing the screen again.
      window.history.replaceState(null, "", `${paths.list}/${value.id}`);
    }
    return "saved";
  }

  /** Saves what's pending now, after any save in flight; says how it went. */
  function flush(): Promise<SaveOutcome> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = (async () => {
      let outcome: SaveOutcome;
      do {
        again.current = false;
        outcome = await saveOnce();
      } while (again.current && outcome !== "failed");
      running.current = null;
      return outcome;
    })();
    running.current = run;
    return run;
  }

  function change(next: Partial<Draft>, when: "now" | "typing") {
    if (next.schedules) {
      // A time changed here no longer opens as the database last said.
      const kept = new Set(
        next.schedules
          .filter((schedule) => {
            const before = draft.current.schedules.find(
              (s) => s.key === schedule.key,
            );
            return before && scheduleMark(before) === scheduleMark(schedule);
          })
          .flatMap((schedule) => (schedule.id ? [schedule.id] : [])),
      );
      setOpenings((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => kept.has(id)),
        ),
      );
    }
    draft.current = { ...draft.current, ...next };
    setShown(draft.current);
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (when === "typing") {
      timer.current = setTimeout(() => void flush(), TYPING_MS);
    } else {
      void flush();
    }
  }

  // Leaving with typing still pending saves it on the way out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving, with the newest draft
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [],
  );

  // "Changed on another screen" is said once: the address loses `?changed=`,
  // so a reload or a shared link doesn't say it again.
  useEffect(() => {
    const id = server.current.id;
    if (data.changed && id) {
      window.history.replaceState(null, "", `${paths.list}/${id}`);
    }
  }, [data.changed, paths.list]);

  async function sendNow() {
    if (!paths.send) return;
    setSending(true);
    // One that can't be saved here goes as it is stored.
    const outcome = stuck === null ? await flush() : "unchanged";
    setSending(false);
    const id = server.current.id;
    if (outcome === "failed" || outcome === "invalid" || !id) {
      setTouched(true);
      // A time that points at something gone holds it: the card on top says so.
      if (outcome === "invalid" && heldCount(draft.current) > 0) {
        heldCard.current?.scrollIntoView({ block: "center" });
        heldCard.current?.focus({ preventScroll: true });
      }
      return;
    }
    router.push(`${paths.send}?template=${id}`);
  }

  function archive() {
    startArchive(async () => {
      // A stuck one has nothing to save first: it is only removed.
      if (stuck === null && (await flush()) === "failed" && stopped.current) {
        return;
      }
      const id = server.current.id;
      if (!id) return;
      stopped.current = true;
      let result: Awaited<ReturnType<TemplateActions["archive"]>>;
      try {
        result = await actions.archive(id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        stopped.current = locked;
        refused(result.failure);
        return;
      }
      router.push(`${paths.list}?removed=${id}`);
    });
  }

  /** How many of a draft's times point at something gone, which holds its saves. */
  function heldCount(snapshot: Draft) {
    return locked
      ? 0
      : snapshot.schedules.filter((schedule) =>
          scheduleGone(schedule, liveDepartments, shiftKeys),
        ).length;
  }
  const held = heldCount(shown);

  const nameMissing =
    !listName.safeParse(shown.name).success && (savedId !== null || touched);
  const kind: RecipientKind = shown.recipient?.kind ?? "none";
  // An order goes to another department; it is set up as one (L5).
  const departments = data.departments.filter((d) => d.id !== order);
  const kinds: RecipientKind[] = order
    ? ["department"]
    : [
        "none",
        ...(departments.length > 0 ? (["department"] as const) : []),
        ...(data.shifts.length > 0 ? (["shift"] as const) : []),
        "role",
      ];

  function chooseKind(next: RecipientKind) {
    const first = departments[0];
    const shift = data.shifts[0];
    const recipient: TemplateRecipient | null =
      next === "department" && first
        ? { kind: "department", department: first.id }
        : next === "shift" && shift
          ? { kind: "shift", shift: shift.key }
          : next === "role"
            ? { kind: "role", role: "worker" }
            : null;
    change({ recipient }, "now");
  }

  const departmentName = (id: string) =>
    data.departmentNames[id] ?? t("to.aDepartment");

  const valuePicker =
    shown.recipient?.kind === "department" ? (
      <FieldRow label={te("department")}>
        <ChoiceMenu
          label={`${te("department")}: ${departmentName(shown.recipient.department)}`}
          value={shown.recipient.department}
          options={departments.map((d) => ({ key: d.id, label: d.name }))}
          onChange={(department) =>
            change({ recipient: { kind: "department", department } }, "now")
          }
        />
      </FieldRow>
    ) : shown.recipient?.kind === "shift" ? (
      <FieldRow label={te("shift")}>
        <ChoiceMenu
          label={`${te("shift")}: ${
            data.shifts.find(
              (s) =>
                shown.recipient?.kind === "shift" &&
                s.key === shown.recipient.shift,
            )?.name ?? ""
          }`}
          value={shown.recipient.shift}
          options={data.shifts.map((s) => ({ key: s.key, label: s.name }))}
          onChange={(shift) =>
            change({ recipient: { kind: "shift", shift } }, "now")
          }
        />
      </FieldRow>
    ) : shown.recipient?.kind === "role" ? (
      <FieldRow label={te("role")}>
        <ChoiceMenu
          label={`${te("role")}: ${ts(`roles.${shown.recipient.role}`)}`}
          value={shown.recipient.role}
          options={data.roles.map((role) => ({
            key: role,
            label: ts(`roles.${role}`),
          }))}
          onChange={(role) =>
            change(
              { recipient: { kind: "role", role: role as StaffRole } },
              "now",
            )
          }
        />
      </FieldRow>
    ) : null;

  const shiftName =
    shown.recipient?.kind === "shift"
      ? data.shifts.find(
          (s) =>
            shown.recipient?.kind === "shift" &&
            s.key === shown.recipient.shift,
        )?.name
      : undefined;
  const readOnlyRecipient =
    shown.recipient?.kind === "department"
      ? data.departmentNames[shown.recipient.department]
        ? t("to.department", {
            name: departmentName(shown.recipient.department),
          })
        : t("to.aDepartment")
      : shown.recipient?.kind === "shift"
        ? shiftName
          ? t("to.shift", { name: shiftName })
          : t("to.aShift")
        : shown.recipient?.kind === "role"
          ? t("to.role", { role: shown.recipient.role })
          : t("to.none");

  const sendButton =
    paths.send && !readOnly ? (
      <Button
        size="lg"
        loading={sending}
        disabled={savedId === null || archiving}
        onClick={() => void sendNow()}
      >
        <Send aria-hidden="true" />
        {te("sendNow")}
      </Button>
    ) : null;

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={saved > 0 ? tm("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      <PageHeader
        back={{ href: paths.list, label: t("title") }}
        title={shown.name.trim() || te("newTitle")}
        subtitle={
          template?.archivedAt
            ? te("removedNote")
            : readOnly
              ? te("viewOnly")
              : stuck
                ? te("stuckSubtitle")
                : savedId
                  ? te("subtitle")
                  : te("newSubtitle")
        }
        actions={sendButton}
      />

      {stuck ? (
        <Card tone="float" padding="md" role="status" className="font-medium">
          {te(`stuck.${stuck}`)}
        </Card>
      ) : null}
      {changedShown ? (
        <Card tone="float" padding="md" role="status" className="font-medium">
          {te("changed")}
        </Card>
      ) : null}
      {held > 0 ? (
        <Card
          ref={heldCard}
          tabIndex={-1}
          tone="float"
          padding="md"
          role="status"
          className="flex flex-col items-start gap-3 font-medium focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex items-start gap-2">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-warning"
            />
            {te("held", { count: held })}
          </span>
          <Button
            variant="secondary"
            onClick={() => setFixGone((count) => count + 1)}
          >
            {te("fixTime")}
          </Button>
        </Card>
      ) : null}
      {failure && !(failure.reason === "changed" && changedShown) ? (
        <Card
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 flex flex-col items-start gap-3 font-medium text-danger xl:top-4"
        >
          {t(`failed.${failure.reason}`)}
          {failure.reason === "createUnknown" ? (
            <Button asChild variant="secondary">
              <Link href={paths.list}>{te("toLists")}</Link>
            </Button>
          ) : null}
        </Card>
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <PageSection title={te("about")}>
            <FieldGroup>
              <GroupedField
                label={te("name")}
                value={shown.name}
                maxLength={NAME_MAX}
                disabled={locked}
                error={nameMissing ? te("nameMissing") : undefined}
                onChange={(event) => {
                  setTouched(true);
                  change({ name: event.target.value }, "typing");
                }}
                onBlur={() => void flush()}
              />
              <GroupedTextArea
                label={te("note")}
                hint={te("noteHint")}
                rows={3}
                value={shown.note}
                maxLength={NOTE_MAX}
                disabled={locked}
                onChange={(event) =>
                  change({ note: event.target.value }, "typing")
                }
                onBlur={() => void flush()}
              />
            </FieldGroup>
          </PageSection>

          <ItemsEditor
            title={te("items")}
            items={shown.items}
            readOnly={locked}
            onChange={(items) => change({ items }, "now")}
            missing={locked ? undefined : te("itemsMissing")}
          />

          <PageSection title={te("recipient")}>
            {locked ? (
              <Card tone="flat" padding="lg">
                {readOnlyRecipient}
              </Card>
            ) : (
              <>
                {gone && template?.recipient ? (
                  <p role="status" className="px-1 font-medium">
                    {te("gone", { kind: template.recipient.kind })}
                  </p>
                ) : null}
                {order ? (
                  <p className="px-1 text-base text-ink-2">
                    {te("order", { name: departmentName(order) })}
                  </p>
                ) : (
                  <Segmented
                    label={te("recipient")}
                    value={kind}
                    onChange={chooseKind}
                    options={kinds.map((value) => ({
                      value,
                      label: te(`recipientKinds.${value}`),
                    }))}
                  />
                )}
                {order && departments.length === 0 ? (
                  <p className="px-1 text-ink-2">{te("noDepartments")}</p>
                ) : order && shown.recipient?.kind !== "department" ? (
                  <FieldGroup>
                    <FieldRow label={te("department")}>
                      <ChoiceMenu
                        label={te("department")}
                        value=""
                        placeholder={te("choose")}
                        options={departments.map((d) => ({
                          key: d.id,
                          label: d.name,
                        }))}
                        onChange={(department) =>
                          change(
                            { recipient: { kind: "department", department } },
                            "now",
                          )
                        }
                      />
                    </FieldRow>
                  </FieldGroup>
                ) : valuePicker ? (
                  <FieldGroup>{valuePicker}</FieldGroup>
                ) : null}
                <p className="px-1 text-ink-2 text-sm">
                  {kind === "none" ? te("noneHint") : te("recipientHint")}
                </p>
              </>
            )}
          </PageSection>

          <SchedulesEditor
            schedules={shown.schedules}
            readOnly={locked}
            onChange={(schedules) => change({ schedules }, "now")}
            times={data.times}
            openings={openings}
            recipient={shown.recipient}
            fixGone={fixGone}
            places={{
              departments: data.departments,
              departmentNames: data.departmentNames,
              shifts: data.shifts,
              roles: data.roles,
            }}
          />

          {readOnly || savedId === null ? null : (
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="ghost"
                className="text-danger"
                loading={archiving}
                disabled={sending}
                onClick={archive}
              >
                <Trash2 aria-hidden="true" />
                {te("archive")}
              </Button>
              <p className="px-1 text-ink-2 text-sm">{te("archiveHint")}</p>
            </div>
          )}
        </div>

        <aside
          aria-label={te("preview")}
          className="hidden min-w-0 flex-col gap-3 md:flex"
        >
          <h2 className="px-1 font-bold text-lg">{te("preview")}</h2>
          <ListPreview
            name={shown.name.trim()}
            note={shown.note.trim() || null}
            items={shown.items}
          />
        </aside>
      </div>
    </PageBody>
  );
}
