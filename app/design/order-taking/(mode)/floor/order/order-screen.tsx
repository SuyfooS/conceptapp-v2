"use client";

import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { FloatingAction } from "@ui/floating-action";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { TextField } from "@ui/text-field";
import { MapPinOff, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  addLine,
  changeTicket,
  putLineBack,
  removeLine,
  send,
  setLabel,
  setTakenBack,
} from "../../../changes";
import { orderDemoTables, READER } from "../../../data";
import { useOpenedWith, useOrderDemo } from "../../../demo-store";
import {
  type DraftLine,
  draftCount,
  itemById,
  type MenuItem,
  type Place,
  placeStatus,
  type SentLine,
  type Ticket,
} from "../../../model";
import {
  departmentName,
  ltr,
  openOrderOf,
  paths,
  personName,
  placeById,
  placeTitle,
  useOrderWords,
  useUndoToast,
} from "../../../parts";
import { ChoiceSheet } from "./choice-sheet";
import { DraftPanel, NoteSheet, SendButton } from "./draft";
import { Picker } from "./picker";
import { Rounds } from "./rounds";

/** A takeaway's few words to call the customer by, at most. */
const LABEL_MAX = 20;

/** The place in the address: `?place=table-4`. */
export function OrderScreen() {
  const placeId = useSearchParams().get("place");
  const opened = useOpenedWith();
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const place = placeById(data, placeId);
  if (!place) {
    return (
      <PageBody>
        <EmptyState
          icon={<MapPinOff />}
          title={t("order.noPlace.title")}
          body={t("order.noPlace.body")}
        >
          <Button asChild>
            <Link href={paths.floor}>{t("order.noPlace.back")}</Link>
          </Button>
        </EmptyState>
      </PageBody>
    );
  }
  return <PlaceOrder key={place.id} place={place} opened={opened} />;
}

/**
 * A place's order (§3.2, §11). Phone: one thing at a time, adding items or
 * the order (the draft, then what was sent), with "שליחת ההזמנה" floating
 * above the tab bar. Tablet: the items beside the draft and the rounds,
 * which stay in sight as the items scroll. Desktop: the floor's places at
 * the start, then the items, then the order.
 */
function PlaceOrder({
  place,
  opened,
}: {
  place: Place;
  opened: string | null;
}) {
  const { t, time } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const order = openOrderOf(data, place.id);
  const draft = data.drafts[place.id] ?? [];
  const title = placeTitle(t, place);
  const [view, setView] = useState<"add" | "order">(() =>
    order || opened === "draft" ? "order" : "add",
  );
  const [choiceFor, setChoiceFor] = useState<MenuItem | null>(() =>
    opened === "choice" ? (itemById(data.menu, "burger") ?? null) : null,
  );
  const [noteFor, setNoteFor] = useState<{
    line: DraftLine;
    kind: "note" | "allergy";
  } | null>(null);
  const [added, setAdded] = useState("");
  const { say, toast } = useUndoToast();
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const roundsHeading = useRef<HTMLHeadingElement>(null);

  // Just sent (`?state=sent`): the toast says so, as after a real send.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens
  useEffect(() => {
    if (opened === "sent") say(t("toast.sent", { place: title }));
  }, []);

  function add(item: MenuItem, choices: string[] = [], qty = 1) {
    update((d) => addLine(d, place.id, item.id, choices, qty));
    setAdded(t("picker.added", { name: item.name }));
  }

  function pick(item: MenuItem) {
    if (item.groups.length > 0) setChoiceFor(item);
    else add(item);
  }

  function sendNow() {
    // A takeaway's first send gives it the next number of the day.
    const sentAs =
      place.kind === "takeaway" && place.name === null
        ? t("place.takeaway", { number: String(data.nextTakeaway) })
        : title;
    update((d) => send(d, place.id, READER, now));
    setView("order");
    say(t("toast.sent", { place: sentAs }));
  }

  function remove(line: DraftLine, index: number) {
    const name = itemById(data.menu, line.itemId)?.name ?? "";
    update((d) => removeLine(d, place.id, line.id));
    // The row goes with its button: the way back takes the focus.
    say(
      t("toast.removed", { name }),
      () => update((d) => putLineBack(d, place.id, line, index)),
      { focus: true, after: () => draftHeading.current },
    );
  }

  function serve(ticket: Ticket) {
    const before = ticket.state;
    update((d) => changeTicket(d, ticket.id, { state: "served" }));
    say(
      t("toast.served", {
        place: title,
        department: departmentName(ticket.department),
      }),
      () => update((d) => changeTicket(d, ticket.id, { state: before })),
      { focus: true, after: () => roundsHeading.current },
    );
  }

  function fire(ticket: Ticket) {
    update((d) =>
      changeTicket(d, ticket.id, { held: false, firedAt: now, seen: false }),
    );
    say(t("toast.fired", { department: departmentName(ticket.department) }));
    roundsHeading.current?.focus({ preventScroll: true });
  }

  function takeBack(line: SentLine) {
    update((d) => setTakenBack(d, line.id, true));
    say(
      t("toast.takenBack", { name: line.name }),
      () => update((d) => setTakenBack(d, line.id, false)),
      { focus: true, after: () => roundsHeading.current },
    );
  }

  const count = draftCount(draft);
  const subtitle = order
    ? t.rich("order.opened", {
        time: time(order.openedAt),
        name: personName(order.openedBy),
        ltr,
      })
    : t("order.free");

  const orderColumn = (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6",
        "md:sticky md:top-8 md:-mx-1 md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] md:overflow-y-auto md:px-1 md:pb-4 xl:max-h-[calc(100dvh-4rem)]",
        view === "order" ? "" : "hidden md:flex",
      )}
    >
      {place.kind === "takeaway" ? (
        <TextField
          label={t("order.label")}
          hint={t("order.labelHint")}
          maxLength={LABEL_MAX}
          autoComplete="off"
          value={place.label ?? ""}
          onChange={(event) =>
            update((d) => setLabel(d, place.id, event.target.value))
          }
        />
      ) : null}
      {/* An empty draft says so beside the items; on a phone, nothing. */}
      <div className={cn(count === 0 && "hidden md:block")}>
        <DraftPanel
          placeId={place.id}
          headingRef={draftHeading}
          onNote={(line, kind) => setNoteFor({ line, kind })}
          onRemove={remove}
          send={
            <div className="hidden md:block">
              <SendButton placeId={place.id} onSend={sendNow} />
            </div>
          }
        />
      </div>
      {order ? (
        <Rounds
          order={order}
          headingRef={roundsHeading}
          onServe={serve}
          onFire={fire}
          onTakeBack={takeBack}
        />
      ) : null}
      <Button
        variant="secondary"
        size="lg"
        className="md:hidden"
        onClick={() => setView("add")}
      >
        <Plus aria-hidden="true" />
        {t("order.view.add")}
      </Button>
    </div>
  );

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.floor, label: t("nav.places") }}
        eyebrow={t("mode")}
        title={title}
        subtitle={subtitle}
      />
      <Segmented
        label={t("order.view.label")}
        value={view}
        onChange={setView}
        className="md:hidden"
        options={[
          { value: "add", label: t("order.view.add") },
          {
            value: "order",
            label: t("order.view.order"),
            badge: { count, label: t("order.view.unsent", { count }) },
          },
        ]}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,24rem)] xl:gap-8">
        <FloorList current={place.id} />
        <div className={cn("min-w-0", view === "add" ? "" : "hidden md:block")}>
          <Picker placeId={place.id} onPick={pick} />
        </div>
        {orderColumn}
      </div>
      {count > 0 ? (
        <div className="md:hidden">
          <FloatingAction>
            <SendButton placeId={place.id} onSend={sendNow} floating />
          </FloatingAction>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {added}
      </p>
      <ChoiceSheet
        item={choiceFor}
        onClose={() => setChoiceFor(null)}
        onAdd={(item, choices, qty) => {
          add(item, choices, qty);
          setChoiceFor(null);
        }}
      />
      <NoteSheet
        placeId={place.id}
        target={noteFor}
        onClose={() => setNoteFor(null)}
        onSaved={() => setNoteFor(null)}
      />
      {toast}
    </PageBody>
  );
}

/** The desktop's first column: every place and its state, to move between them. */
function FloorList({ current }: { current: string }) {
  const { t } = useOrderWords();
  const { data, now } = useOrderDemo();
  const places = [
    ...orderDemoTables,
    ...data.takeaways.filter((p) => p.name !== null || p.id === current),
  ];
  return (
    <nav
      aria-label={t("order.floorList")}
      className="hidden xl:sticky xl:top-8 xl:-mx-1 xl:block xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:px-1 xl:pb-4"
    >
      <ListGroup>
        {places.map((place) => {
          const status = placeStatus(openOrderOf(data, place.id), now);
          return (
            <ListRow
              key={place.id}
              href={paths.order(place.id)}
              current={place.id === current}
              title={placeTitle(t, place)}
              subtitle={
                status.kind === "ready"
                  ? t("floor.state.ready")
                  : status.kind === "late"
                    ? t("floor.state.late", { count: status.minutes })
                    : status.kind === "open"
                      ? t("floor.state.open", { count: status.minutes })
                      : t("floor.state.free")
              }
            />
          );
        })}
      </ListGroup>
    </nav>
  );
}
