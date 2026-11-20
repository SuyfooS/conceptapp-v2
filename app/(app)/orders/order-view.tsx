"use client";

import {
  addToDraft,
  type DraftLine,
  draftCount,
  draftKey,
  draftRoutes,
  placeState,
  putDraftLineBack,
  refusalMark,
  removeDraftLine,
  roundOf,
  sendTarget,
} from "@domain/order-screens";
import type { Menu, MenuItem, OrderPlace } from "@domain/order-taking";
import {
  ORDER_CAPS,
  type OrderDetail,
  type OrderFloor,
  type OrderLine,
  type OrderTicket,
  type RoundTarget,
} from "@domain/orders";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { FloatingAction } from "@ui/floating-action";
import { ListGroup, ListRow } from "@ui/list-row";
import { SendOrderButton } from "@ui/order-draft";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { TextField } from "@ui/text-field";
import { Clock3, MapPinOff, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHeldWrite } from "../use-held-write";
import { DraftPanel } from "./draft-panel";
import { useOrdersMode } from "./orders-mode";
import {
  FailureLine,
  failureWords,
  ltr,
  OffShiftCard,
  placeStateWords,
  sendFailureWords,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";
import type { SendRefusal } from "./orders-types";
import { Picker } from "./picker";
import { Rounds } from "./rounds";
import { sendWaits } from "./send-store";

/** Where the screen is: a place, an open takeaway, or a new one. */
export type OrderWhere =
  | { kind: "place"; place: OrderPlace }
  | { kind: "takeaway"; order: string | null };

/**
 * A place's or a takeaway's order (waiter mode P4, the design's §3.2 and
 * §11). Phone: one thing at a time, adding items or the order (the draft,
 * then what was sent), with "שליחת ההזמנה" floating above the tab bar.
 * Tablet: the items beside the draft and the rounds, which stay in sight as
 * the items scroll. Desktop: the floor's places at the start, then the
 * items, then the order. Someone who runs orders off a shift reads and
 * serves, and the send asks for a shift (default 12); a taker off one finds
 * the screen waiting, their draft kept.
 */
export function OrderView({
  where,
  order,
  menu,
  favourites,
  floor,
}: {
  where: OrderWhere;
  /** Its open order, or null while it has none; undefined while it is read. */
  order: OrderDetail | null | undefined;
  menu: Menu | null;
  favourites: readonly string[];
  /** The floor, for the desktop's list of places. */
  floor: OrderFloor | null;
}) {
  const { t, placeTitle, time, person, department } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const { frame, paths, drafts, sender, actions, say, off, clock, newId } =
    mode;
  const router = useRouter();
  const place = where.kind === "place" ? where.place : null;
  const known = order ?? null;
  const key = place
    ? draftKey({ place: place.id })
    : draftKey({ takeaway: where.kind === "takeaway" ? where.order : null });
  const draft = drafts.get(key);
  const count = draftCount(draft);
  const title = placeTitle({
    placeName: place?.name ?? null,
    takeaway: known?.takeaway?.number ?? null,
  });
  const [view, setView] = useState<"add" | "order">(() =>
    known || count > 0 ? "order" : "add",
  );
  const [label, setLabel] = useState(known?.takeaway?.label ?? "");
  const [sending, setSending] = useState(false);
  // What was just added, for screen readers: a new node each time, so a
  // second tap on the same item is said again.
  const [added, setAdded] = useState({ text: "", stamp: 0 });
  // Served and taken back here: shown at once, until the order's next read.
  const [served, setServed] = useState<string[]>([]);
  const [takenBack, setTakenBack] = useState<string[]>([]);
  const readAt = known?.now;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new read of the order says what is so
  useEffect(() => {
    setServed([]);
    setTakenBack((was) => was.filter((id) => heldBack.current.has(id)));
  }, [readAt]);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const roundsHeading = useRef<HTMLHeadingElement>(null);
  const heldBack = useRef(new Set<string>());
  /** The take-back's toast, to take away once its way back is gone. */
  const backToast = useRef<(() => void) | null>(null);
  /**
   * A new takeaway's rounds this screen showed on their way while on show,
   * by key: once one lands, the screen goes to the order it opened.
   */
  const onWay = useRef(new Set<string>());
  /** The order this screen went to, so it goes there once. */
  const movedTo = useRef<string | null>(null);
  // Whether this screen is the one on show: Next keeps a screen left inside
  // the mode in a hidden <Activity>, where its effects go and its awaits
  // still finish. Left, it forgets the rounds it showed on their way: whoever
  // comes back to a new takeaway starts one, and the toast said where the
  // last one went.
  const onScreen = useRef(false);
  useEffect(() => {
    onScreen.current = true;
    const shown = onWay.current;
    return () => {
      onScreen.current = false;
      shown.clear();
    };
  }, []);

  // A take-back waits 8 seconds for its "ביטול", and goes on leaving. Once
  // it went, by its time, the page hidden or the screen left (the mode's
  // toast stays over its other screens), its "ביטול" goes with it.
  const back = useHeldWrite<{ line: string; name: string }>(
    async ({ line }) => {
      backToast.current?.();
      backToast.current = null;
      heldBack.current.delete(line);
      const result = await actions.takeBack(line).catch(() => null);
      if (!result?.ok) {
        setTakenBack((was) => was.filter((id) => id !== line));
        say(failureWords(t, result ? result.failure : "failed"));
      }
      mode.syncNow();
    },
  );

  const refusal = sender.refusal(key);
  const pending = sender.pending(key);
  // A new takeaway's first round on its way gives it its order: until it
  // lands, a second send would open a second takeaway, whichever send it
  // was (this screen's, or one that went again after the mode was left or
  // the tab read again). What is added meanwhile waits, and is that order's.
  const busy = sending || sendWaits(key, pending.length);
  const newTakeaway = where.kind === "takeaway" && where.order === null;
  const onWayKeys = newTakeaway ? pending.map((p) => p.key).join(" ") : "";
  useEffect(() => {
    for (const shown of onWayKeys.split(" ")) {
      if (shown) onWay.current.add(shown);
    }
  }, [onWayKeys]);
  // One of them landed, whichever send it was: the screen goes to its order.
  const landed = sender.landed;
  useEffect(() => {
    if (!landed || !onWay.current.has(landed.key)) return;
    onWay.current.clear();
    if (movedTo.current === landed.order) return;
    movedTo.current = landed.order;
    router.replace(paths.takeaway(landed.order));
  }, [landed, router, paths]);
  // What one send takes: a round's 40 lines at most, the rest after it.
  const round = roundOf(draft);
  const routes = draftRoutes(menu?.items ?? [], round, frame.departmentOrder)
    .map(({ department: id, count: n }) =>
      t("send.route", { department: department(id), count: n }),
    )
    .join(", ");
  // Someone who runs orders reads off a shift; the send waits for one, as
  // the frame said it or a refused send heard it since.
  const needsShift = clock !== null;
  const mark = refusal ? refusalMark(refusal.failure) : null;

  // Every change to the draft starts from what it holds when it lands
  // (`drafts.update`): an undo kept for 8 seconds never puts back an old copy.
  function pick(item: MenuItem) {
    drafts.update(key, (lines) => addToDraft(lines, item.id, newId));
    // What it now holds of the item, for screen readers: as drawn, plus one.
    const n = addToDraft(draft, item.id, () => "")
      .filter((line) => line.item === item.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    setAdded((was) => ({
      text: t("picker.added", { name: item.name, count: n }),
      stamp: was.stamp + 1,
    }));
  }

  function remove(line: DraftLine, index: number) {
    const name = menu?.items.find((i) => i.id === line.item)?.name ?? "";
    drafts.update(key, (lines) => removeDraftLine(lines, line.id).lines);
    // The row goes with its button: the way back takes the focus.
    say(t("toast.removed", { name }), {
      undo: () =>
        drafts.update(key, (lines) => putDraftLineBack(lines, line, index)),
      focus: true,
      after: () => draftHeading.current,
    });
  }

  function noteRemoved(line: DraftLine) {
    const name = menu?.items.find((i) => i.id === line.item)?.name ?? "";
    say(t("toast.noteRemoved", { name }), {
      undo: () =>
        drafts.update(key, (lines) =>
          lines.map((l) =>
            l.id === line.id
              ? { ...l, note: line.note, allergy: line.allergy }
              : l,
          ),
        ),
      focus: true,
      after: () => draftHeading.current,
    });
  }

  async function send(
    target = sendTarget({
      order: known?.id ?? null,
      place: place?.id ?? null,
      label,
    }),
  ) {
    const lines = roundOf(drafts.get(key));
    if (lines.length === 0 || busy || frame.viewing) return;
    setSending(true);
    setView("order");
    const outcome = await sender.send(key, target, lines);
    setSending(false);
    if (!outcome.ok) return;
    const sentAs = placeTitle({
      placeName: place?.name ?? null,
      takeaway: outcome.round.takeaway,
    });
    // Left meanwhile (the answer came after a while, offline): the toast
    // says it wherever the person is, with the way to it, and nothing moves
    // them.
    if (!onScreen.current) {
      say(t("toast.sent", { place: sentAs }), {
        open: place
          ? paths.place(place.id)
          : paths.takeaway(outcome.round.order),
      });
      return;
    }
    say(t("toast.sent", { place: sentAs }));
    roundsHeading.current?.focus({ preventScroll: true });
    // A new takeaway's first send gives it its number, and its own page.
    const order = outcome.round.order;
    if (newTakeaway && movedTo.current !== order) {
      onWay.current.clear();
      movedTo.current = order;
      router.replace(paths.takeaway(order));
    }
  }

  async function serve(ticket: OrderTicket) {
    setServed((was) => [...was, ticket.id]);
    const result = await actions.serve(ticket.id, true).catch(() => null);
    if (!result?.ok) {
      setServed((was) => was.filter((id) => id !== ticket.id));
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    say(
      t("toast.served", {
        place: title,
        department: department(ticket.department),
      }),
      {
        undo: () => {
          setServed((was) => was.filter((id) => id !== ticket.id));
          void actions.serve(ticket.id, false).then(() => mode.syncNow());
        },
        focus: true,
        after: () => roundsHeading.current,
      },
    );
  }

  async function fire(ticket: OrderTicket) {
    if (!known) return;
    const result = await actions.fire(known.id).catch(() => null);
    if (!result?.ok) {
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    say(t("toast.fired", { department: department(ticket.department) }));
    roundsHeading.current?.focus({ preventScroll: true });
  }

  function takeBack(line: OrderLine) {
    heldBack.current.add(line.id);
    setTakenBack((was) => [...was, line.id]);
    back.hold({ line: line.id, name: line.name });
    backToast.current = say(t("toast.takenBack", { name: line.name }), {
      undo: () => {
        backToast.current = null;
        const was = back.release();
        if (was) heldBack.current.delete(was.line);
        setTakenBack((ids) => ids.filter((id) => id !== line.id));
      },
      focus: true,
      after: () => roundsHeading.current,
      onWaitingChange: (waiting) => (waiting ? back.pause() : back.resume()),
    });
  }

  const header = (
    <PageHeader
      back={{ href: paths.floor, label: t("order.noPlace.back") }}
      eyebrow={heading.eyebrow}
      title={title}
      subtitle={
        known
          ? person(known.openedBy)
            ? t.rich("order.opened", {
                time: time(known.openedAt),
                name: person(known.openedBy),
                ltr,
              })
            : t.rich("order.openedAt", { time: time(known.openedAt), ltr })
          : t("order.free")
      }
    />
  );

  // A taker off a shift: the screen waits, the draft kept.
  if (off) {
    return (
      <PageBody className={pageGlowClass}>
        {header}
        <OffShiftCard off={off} />
      </PageBody>
    );
  }
  // A takeaway that closed, or isn't one: nothing to add to here.
  if (where.kind === "takeaway" && where.order !== null && order === null) {
    return <NoPlace />;
  }

  const sendButton = (floating: boolean) =>
    needsShift ? (
      <Button asChild size="lg" className="w-full">
        <Link href={paths.clock}>
          <Clock3 aria-hidden="true" />
          {clock === "staleShift" ? t("staleShift.action") : t("send.clockIn")}
        </Link>
      </Button>
    ) : (
      <SendOrderButton
        label={t("send.label")}
        count={t("send.count", { count: draftCount(round) })}
        routes={routes}
        onClick={() => void send()}
        floating={floating}
        disabled={frame.viewing}
        loading={busy}
      />
    );

  const refused = refusal ? (
    <RefusalLine
      title={title}
      menu={menu}
      failure={refusal}
      onAgain={(target) => {
        sender.clearRefusal(key);
        void send(target);
      }}
      place={place?.id ?? null}
    />
  ) : null;

  const orderColumn = (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6",
        "md:sticky md:top-8 md:-mx-1 md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] md:overflow-y-auto md:px-1 md:pb-4 xl:max-h-[calc(100dvh-4rem)]",
        view === "order" ? "" : "hidden md:flex",
      )}
    >
      {where.kind === "takeaway" ? (
        <TextField
          label={t("order.label")}
          hint={t("order.labelHint")}
          maxLength={ORDER_CAPS.label}
          autoComplete="off"
          value={label}
          disabled={frame.viewing}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            // After its first send, a label saves on its own.
            if (!known || frame.viewing) return;
            const words = label.trim() || null;
            if (words === (known.takeaway?.label ?? null)) return;
            // Offline, or the server failed: it says so, and the next blur
            // saves it again.
            void actions
              .setLabel(known.id, words)
              .catch(() => null)
              .then((result) => {
                say(
                  result?.ok
                    ? t("order.labelSaved")
                    : failureWords(t, result ? result.failure : "failed"),
                );
                mode.syncNow();
              });
          }}
        />
      ) : null}
      {refused}
      {/* An empty draft says so beside the items; on a phone, nothing. */}
      <div className={cn(count === 0 && "hidden md:block")}>
        <DraftPanel
          draft={key}
          menu={menu}
          routes={routes}
          headingRef={draftHeading}
          onRemove={remove}
          onNoteRemoved={noteRemoved}
          marked={
            refusal && mark
              ? {
                  items: refusal.items,
                  word:
                    mark === "soldOut"
                      ? t("picker.soldOut")
                      : t("picker.noRoute"),
                }
              : null
          }
          send={<div className="hidden md:block">{sendButton(false)}</div>}
        />
      </div>
      <Rounds
        order={known}
        pending={pending}
        menu={menu}
        headingRef={roundsHeading}
        served={served}
        takenBack={takenBack}
        onServe={(ticket) => void serve(ticket)}
        onFire={(ticket) => void fire(ticket)}
        onTakeBack={takeBack}
      />
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
      {header}
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
        <FloorList floor={floor} menu={menu} current={key} />
        <div className={cn("min-w-0", view === "add" ? "" : "hidden md:block")}>
          {/* A refusal says so over the items too, where the phone is. */}
          {view === "add" ? (
            <div className="mb-4 md:hidden">{refused}</div>
          ) : null}
          <Picker
            menu={menu}
            favourites={favourites}
            draft={draft}
            onPick={pick}
          />
        </div>
        {orderColumn}
      </div>
      {count > 0 ? (
        <div className="md:hidden">
          <FloatingAction>{sendButton(true)}</FloatingAction>
        </div>
      ) : null}
      {frame.viewing ? (
        <p className="text-ink-2">{t("failed.viewOnly")}</p>
      ) : null}
      <p role="status" className="sr-only">
        {added.text ? <span key={added.stamp}>{added.text}</span> : null}
      </p>
    </PageBody>
  );
}

/** Why the last send was refused, and what to do now. */
function RefusalLine({
  title,
  menu,
  failure,
  place,
  onAgain,
}: {
  title: string;
  menu: Menu | null;
  failure: SendRefusal;
  place: string | null;
  onAgain: (target: RoundTarget) => void;
}) {
  const { t } = useOrderWords();
  const items = failure.items
    .map((id) => menu?.items.find((item) => item.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  if (failure.failure === "taken" && failure.order) {
    const order = failure.order;
    return (
      <FailureLine>
        {t("failed.taken", { place: title })}{" "}
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => onAgain(place ? { order, place } : { order })}
        >
          {t("failed.takenAdd")}
        </Button>
      </FailureLine>
    );
  }
  if (failure.failure === "closed") {
    return (
      <FailureLine>
        {t("failed.closed")}{" "}
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => onAgain(place ? { place } : { takeaway: true })}
        >
          {t("failed.closedAgain")}
        </Button>
      </FailureLine>
    );
  }
  // Off a shift: a taker's screen says it in place of the draft; someone who
  // runs orders keeps the screen, and reads why here, with the clock as the
  // send's place.
  return (
    <FailureLine>{sendFailureWords(t, failure.failure, items)}</FailureLine>
  );
}

/** The desktop's first column: every place and its state, to move between them. */
function FloorList({
  floor,
  menu,
  current,
}: {
  floor: OrderFloor | null;
  menu: Menu | null;
  current: string;
}) {
  const { t, placeTitle } = useOrderWords();
  const { frame, paths, now, drafts } = useOrdersMode();
  if (!floor) return <div className="hidden xl:block" />;
  const places = menu?.places ?? [];
  // A new takeaway is a row while it is being taken or has a draft, as its
  // tile on the floor is.
  const newTakeaway = draftKey({ takeaway: null });
  const rows = [
    ...places.map((place) => ({
      key: draftKey({ place: place.id }),
      title: placeTitle({ placeName: place.name, takeaway: null }),
      order: floor.orders.find((o) => o.place === place.id) ?? null,
      href: paths.place(place.id),
    })),
    ...floor.orders
      .filter((o) => o.takeaway !== null)
      .map((o) => ({
        key: draftKey({ takeaway: o.id }),
        title: placeTitle(o),
        order: o,
        href: paths.takeaway(o.id),
      })),
    ...(current === newTakeaway || (drafts.counts[newTakeaway] ?? 0) > 0
      ? [
          {
            key: newTakeaway,
            title: placeTitle({ placeName: null, takeaway: null }),
            order: null,
            href: paths.takeaway(null),
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label={t("order.floorList")}
      className="hidden xl:sticky xl:top-8 xl:-mx-1 xl:block xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:px-1 xl:pb-4"
    >
      <ListGroup>
        {rows.map((row) => (
          <ListRow
            key={row.key}
            href={row.href}
            current={row.key === current}
            title={row.title}
            subtitle={placeStateWords(
              t,
              placeState(row.order, now, frame.lateAfterMinutes),
              drafts.counts[row.key] ?? 0,
            )}
          />
        ))}
      </ListGroup>
    </nav>
  );
}

/** A place that isn't one (removed, or its takeaway closed): back to the list. */
export function NoPlace() {
  const { t } = useOrderWords();
  const { paths } = useOrdersMode();
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
