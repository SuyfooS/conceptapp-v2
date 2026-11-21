"use client";

import {
  addToDraft,
  closeState,
  type DraftLine,
  draftCount,
  draftKey,
  draftRoutes,
  freePlaces,
  placeState,
  putDraftLineBack,
  refusalMark,
  removeDraftLine,
  roundOf,
  sendTarget,
} from "@domain/order-screens";
import type { Menu, MenuItem, OrderPlace } from "@domain/order-taking";
import {
  type CompReason,
  type LineCancelReason,
  liveItemCount,
  ORDER_CAPS,
  type OrderCancelReason,
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
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { TextField } from "@ui/text-field";
import {
  ArrowLeftRight,
  Ban,
  Clock3,
  MapPinOff,
  Plus,
  Receipt,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Ref, useEffect, useRef, useState } from "react";
import { useHeldWrite } from "../use-held-write";
import { CancelOrderSheet } from "./cancel-order-sheet";
import { DraftPanel } from "./draft-panel";
import {
  type LineFixPick,
  LineSheet,
  type LineSheetTarget,
} from "./line-sheet";
import { MoveSheet } from "./move-sheet";
import { useOrdersMode } from "./orders-mode";
import {
  FailureLine,
  type FixWrite,
  failureWords,
  fixFailureWords,
  ltr,
  OffShiftCard,
  placeStateWords,
  sendFailureWords,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";
import type { OrdersActionResult, SendRefusal } from "./orders-types";
import { Picker } from "./picker";
import { type LineShown, Rounds, shownOf } from "./rounds";
import { sendWaits } from "./send-store";

/** Where the screen is: a place, an open takeaway, or a new one. */
export type OrderWhere =
  | { kind: "place"; place: OrderPlace }
  | { kind: "takeaway"; order: string | null };

/**
 * A fix held for its "ביטול" (P5): a line taken back, cancelled or put back,
 * on the house or off it, or the whole order cancelled. One at a time, as
 * the mode has one toast: holding another sends the one before.
 */
type HeldFix =
  | { kind: "takeBack" | "restore" | "uncomp"; line: string }
  | { kind: "cancel"; line: string; reason: LineCancelReason }
  | { kind: "comp"; line: string; reason: CompReason }
  | {
      kind: "cancelOrder";
      order: string;
      reason: OrderCancelReason;
      /** Its lines still live, which the screen shows cancelled meanwhile. */
      lines: string[];
    };

/** The lines a held fix shows changed. */
const linesOf = (fix: HeldFix) =>
  fix.kind === "cancelOrder" ? fix.lines : [fix.line];

/** Which refusal words a held fix gets. */
const fixWriteOf = (fix: HeldFix): FixWrite =>
  fix.kind === "comp" || fix.kind === "uncomp"
    ? "comp"
    : fix.kind === "cancelOrder"
      ? "order"
      : fix.kind === "restore"
        ? "restore"
        : "line";

/** Drawn and shown: an element the keyboard's focus can go to. */
function onView(element: Element | null | undefined): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element !== document.body &&
    element.isConnected &&
    element.getClientRects().length > 0
  );
}

/** Shown and not turned off: what the focus can go back to and press again. */
const pressable = (element: HTMLElement | null): element is HTMLElement =>
  onView(element) && !element.matches(":disabled");

/**
 * The title of the screen on show: this one's, else the one Next shows in
 * its place (after a move this screen waits hidden, the order's new place
 * on show).
 */
function titleOnShow(own: HTMLElement | null): HTMLElement | null {
  if (onView(own)) return own;
  return (
    [...document.querySelectorAll<HTMLElement>("main h1[tabindex]")].find(
      onView,
    ) ?? null
  );
}

/** An order's lines with the screen's own fixes over them, until its next read. */
function withShown(
  order: OrderDetail,
  fixed: Readonly<Record<string, LineShown>>,
): OrderDetail {
  const at = order.now;
  return {
    ...order,
    rounds: order.rounds.map((round) => ({
      ...round,
      tickets: round.tickets.map((ticket) => ({
        ...ticket,
        lines: ticket.lines.map((line) => {
          const shown = fixed[line.id];
          if (!shown) return line;
          return {
            ...line,
            takenBackAt:
              shown.state === "takenBack" ? (line.takenBackAt ?? at) : null,
            cancelledAt:
              shown.state === "cancelled" ? (line.cancelledAt ?? at) : null,
            compedAt: shown.state === "comped" ? (line.compedAt ?? at) : null,
          };
        }),
      })),
    })),
  };
}

/**
 * A place's or a takeaway's order (waiter mode P4, the design's §3.2 and
 * §11). Phone: one thing at a time, adding items or the order (the draft,
 * then what was sent, then the order whole), with "שליחת ההזמנה" floating
 * above the tab bar. Tablet: the items beside the draft and the rounds,
 * which stay in sight as the items scroll. Desktop: the floor's places at
 * the start, then the items, then the order. Someone who runs orders off a
 * shift reads and serves, and the send asks for a shift (default 12); a
 * taker off one finds the screen waiting, their draft kept. P5 fixes it: a
 * sent line's sheet, and "ההזמנה כולה" (close, move, cancel), each with its
 * "ביטול"; a line fix and a whole order's cancel wait 8 seconds, a close
 * and a move are written at once and undone by a write (the plan's T2): the
 * move back, and the close taken back whole, what it served back in the
 * kitchen. They wait while a round of this screen is on its way.
 */
export function OrderView({
  where,
  order,
  closedOrder = null,
  menu,
  favourites,
  floor,
}: {
  where: OrderWhere;
  /** Its open order, or null while it has none; undefined while it is read. */
  order: OrderDetail | null | undefined;
  /** A takeaway's order once closed or cancelled, which its screen says. */
  closedOrder?: OrderDetail | null;
  menu: Menu | null;
  favourites: readonly string[];
  /** The floor, for the desktop's list of places and where an order moves. */
  floor: OrderFloor | null;
}) {
  const { t, placeTitle, department } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const {
    frame,
    paths,
    drafts,
    sender,
    actions,
    say,
    tell,
    off,
    clock,
    newId,
  } = mode;
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
  // Served and fixed here: shown at once, until the order's next read (a
  // fix still held, until it went and a read came after).
  const [served, setServed] = useState<string[]>([]);
  const [fixed, setFixed] = useState<Record<string, LineShown>>({});
  const readAt = known?.now;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new read of the order says what is so
  useEffect(() => {
    setServed([]);
    setFixed((was) =>
      Object.fromEntries(
        Object.entries(was).filter(([id]) => heldLines.current.has(id)),
      ),
    );
  }, [readAt]);
  // The sheets: a line's fixes, the move, the whole order's cancel.
  const [sheet, setSheet] = useState<LineSheetTarget | null>(null);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // The sheets are the open order's they opened on: once it goes (closed or
  // moved, on another phone too, while the sheet was open or the screen
  // waited hidden), they close, so none opens again over the next order at
  // this place. Set while drawing, as a state that follows a prop: never
  // drawn open for another order, not even once.
  const openId = known?.status === "open" ? known.id : null;
  const [sheetsFor, setSheetsFor] = useState(openId);
  if (sheetsFor !== openId) {
    setSheetsFor(openId);
    setSheet(null);
    setMoving(false);
    setCancelling(false);
  }
  // A close or a move on its way: the order's other rows wait for it.
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const roundsHeading = useRef<HTMLHeadingElement>(null);
  const actionsHeading = useRef<HTMLHeadingElement>(null);
  /** The lines a held fix shows changed. */
  const heldLines = useRef(new Set<string>());
  /** The held fix's toast, to take away once its way back is gone. */
  const fixToast = useRef<(() => void) | null>(null);
  /**
   * A new takeaway's rounds this screen showed on their way while on show,
   * by key: once one lands, the screen goes to the order it opened.
   */
  const onWay = useRef(new Set<string>());
  /** The order this screen went to, so it goes there once. */
  const movedTo = useRef<string | null>(null);
  /** What opened the sheet on show: the focus goes back to it on closing. */
  const opener = useRef<HTMLElement | null>(null);
  /** Moved back here by the move's "ביטול": the title takes the focus. */
  const backHere = useRef(false);
  // Whether this screen is the one on show: Next keeps a screen left inside
  // the mode in a hidden <Activity>, where its effects go and its awaits
  // still finish. Left, it forgets the rounds it showed on their way: whoever
  // comes back to a new takeaway starts one, and the toast said where the
  // last one went.
  const onScreen = useRef(false);
  useEffect(() => {
    onScreen.current = true;
    // On show again after the move's "ביטול": the focus was on the screen
    // the order had gone to, now hidden, unless the person put it elsewhere.
    if (backHere.current) {
      backHere.current = false;
      if (!onView(document.activeElement)) {
        titleRef.current?.focus({ preventScroll: true });
      }
    }
    const ways = onWay.current;
    return () => {
      onScreen.current = false;
      ways.clear();
    };
  }, []);

  /**
   * Back to what opened a sheet while it is there to press, else `instead`:
   * what it acted on may have gone, or turned off, with what was picked.
   */
  const backTo = (instead: HTMLElement | null) =>
    pressable(opener.current) ? opener.current : instead;
  /** A sheet opens: the focus comes back to what opened it. */
  const openFrom = (from: HTMLElement, open: () => void) => {
    opener.current = from;
    open();
  };

  const unshow = (lines: readonly string[]) =>
    setFixed((was) =>
      Object.fromEntries(
        Object.entries(was).filter(([id]) => !lines.includes(id)),
      ),
    );

  function sendFix(value: HeldFix): Promise<OrdersActionResult> {
    switch (value.kind) {
      case "takeBack":
        return actions.takeBack(value.line);
      case "cancel":
        return actions.cancelLine(value.line, value.reason, true);
      case "restore":
        return actions.cancelLine(value.line, null, false);
      case "comp":
        return actions.compLine(value.line, value.reason, true);
      case "uncomp":
        return actions.compLine(value.line, null, false);
      default:
        return actions.cancelOrder(value.order, value.reason);
    }
  }

  // A fix waits 8 seconds for its "ביטול", and goes on leaving. Once it
  // went, by its time, the page hidden or the screen left (the mode's toast
  // stays over its other screens), its "ביטול" goes with it.
  const fix = useHeldWrite<HeldFix>(async (value) => {
    fixToast.current?.();
    fixToast.current = null;
    const lines = linesOf(value);
    for (const id of lines) heldLines.current.delete(id);
    const result = await sendFix(value).catch(() => null);
    if (!result?.ok) {
      unshow(lines);
      say(
        fixFailureWords(
          t,
          result ? result.failure : "failed",
          fixWriteOf(value),
        ),
      );
    }
    mode.syncNow();
  });
  /** A whole order's cancel waits: nothing more goes to it meanwhile. */
  const cancelHeld = fix.held?.kind === "cancelOrder";
  /**
   * The lines whose fix waits: their way back is on the toast. While the
   * whole order's cancel waits, none of its lines is fixed on its own.
   */
  const heldNow = cancelHeld
    ? (known?.rounds ?? [])
        .flatMap((r) => r.tickets)
        .flatMap((ticket) => ticket.lines)
        .map((line) => line.id)
    : fix.held
      ? linesOf(fix.held)
      : [];

  const refusal = sender.refusal(key);
  const pending = sender.pending(key);
  // A new takeaway's first round on its way gives it its order: until it
  // lands, a second send would open a second takeaway, whichever send it
  // was (this screen's, or one that went again after the mode was left or
  // the tab read again). What is added meanwhile waits, and is that order's.
  const busySending = sending || sendWaits(key, pending.length);
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
    if (lines.length === 0 || busySending || frame.viewing || cancelHeld) {
      return;
    }
    setSending(true);
    setView("order");
    const outcome = await sender.send(key, target, lines);
    setSending(false);
    if (!outcome.ok) return;
    const sentAs = placeTitle({
      placeName: place?.name ?? null,
      takeaway: outcome.round.takeaway,
    });
    // The answer may come seconds after the press (retried on a slow link),
    // while a way back said meanwhile (a take-back, a serve) is on the
    // toast: it is told as news, so never in that way back's place, and at
    // once when none is offered.
    const sent = `sent:${outcome.round.round}`;
    // Left meanwhile (the answer came after a while, offline): the toast
    // says it wherever the person is, with the way to it; nothing moves them.
    if (!onScreen.current) {
      const open = place
        ? paths.place(place.id)
        : paths.takeaway(outcome.round.order);
      tell(sent, () => say(t("toast.sent", { place: sentAs }), { open }));
      return;
    }
    tell(sent, () => say(t("toast.sent", { place: sentAs })));
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
    // A fix held on the order goes first, as it was made first: a serve that
    // landed before it would leave a taker's cancel too late for its ticket.
    await fix.commit();
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
    // A fix held on the order goes first, as for a serve.
    await fix.commit();
    const result = await actions.fire(known.id).catch(() => null);
    if (!result?.ok) {
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    say(t("toast.fired", { department: department(ticket.department) }));
    roundsHeading.current?.focus({ preventScroll: true });
  }

  /**
   * Holds a fix for its "ביטול": the lines show as it leaves them at once,
   * and the toast offers the way back for 8 seconds (stopping while it is
   * reached). A fix held before goes now.
   */
  function holdFix(
    value: HeldFix,
    shown: Record<string, LineShown>,
    text: string,
  ) {
    fix.hold(value);
    const lines = linesOf(value);
    for (const id of lines) heldLines.current.add(id);
    setFixed((was) => ({ ...was, ...shown }));
    fixToast.current = say(text, {
      undo: () => {
        fixToast.current = null;
        const was = fix.release();
        if (was) for (const id of linesOf(was)) heldLines.current.delete(id);
        unshow(lines);
      },
      focus: true,
      after: () => roundsHeading.current,
      onWaitingChange: (waiting) => (waiting ? fix.pause() : fix.resume()),
    });
  }

  function takeBack(line: OrderLine) {
    holdFix(
      { kind: "takeBack", line: line.id },
      { [line.id]: { state: "takenBack" } },
      t("toast.takenBack", { name: line.name }),
    );
  }

  function pickFix(target: LineSheetTarget, choice: LineFixPick) {
    setSheet(null);
    const { id, name } = target.line;
    switch (choice.kind) {
      case "cancel":
        holdFix(
          { kind: "cancel", line: id, reason: choice.reason },
          { [id]: { state: "cancelled", reason: choice.reason } },
          t("toast.cancelled", { name }),
        );
        break;
      case "restore":
        holdFix(
          { kind: "restore", line: id },
          { [id]: { state: "live" } },
          t("toast.restored", { name }),
        );
        break;
      case "comp":
        holdFix(
          { kind: "comp", line: id, reason: choice.reason },
          { [id]: { state: "comped", reason: choice.reason } },
          t("toast.comped", { name }),
        );
        break;
      default:
        holdFix(
          { kind: "uncomp", line: id },
          { [id]: { state: "live" } },
          t("toast.uncomped", { name }),
        );
    }
  }

  // The order as the screen shows it, its fixes made here over it.
  const shownOrder = known ? withShown(known, fixed) : null;
  const liveIds = shownOrder
    ? shownOrder.rounds
        .flatMap((r) => r.tickets)
        .flatMap((ticket) => ticket.lines)
        .filter((line) => shownOf(line).state === "live")
        .map((line) => line.id)
    : [];
  // What a whole order's cancel takes, in items: two coffees on a line are two.
  const liveItems = shownOrder ? liveItemCount(shownOrder) : 0;
  const closing = shownOrder
    ? closeState(
        {
          rounds: shownOrder.rounds.map((r) => ({
            ...r,
            tickets: r.tickets.map((ticket) => ({
              ...ticket,
              status: served.includes(ticket.id) ? "served" : ticket.status,
            })),
          })),
        },
        frame.departmentOrder,
      )
    : { held: false, unserved: [] };
  const free = freePlaces(
    menu?.places ?? [],
    floor ?? { orders: [] },
    place?.id ?? null,
  );

  function cancelWhole(reason: OrderCancelReason) {
    setCancelling(false);
    if (!known) return;
    holdFix(
      { kind: "cancelOrder", order: known.id, reason, lines: liveIds },
      Object.fromEntries(
        liveIds.map((id) => [id, { state: "cancelled" as const, reason }]),
      ),
      t("toast.orderCancelled", { place: title }),
    );
  }

  /** A write to the order whole, at once: a held line fix goes first. */
  async function orderWrite(
    write: () => Promise<OrdersActionResult>,
  ): Promise<OrdersActionResult | null> {
    setBusy(true);
    await fix.commit();
    const result = await write().catch(() => null);
    setBusy(false);
    mode.syncNow();
    return result;
  }

  async function close() {
    if (!known || frame.viewing) return;
    const id = known.id;
    const result = await orderWrite(() => actions.close(id));
    if (!result?.ok) {
      say(fixFailureWords(t, result ? result.failure : "failed", "close"));
      return;
    }
    // The section goes with the order: the way back takes the focus. It
    // takes the close back whole: the order opens again and what the close
    // served goes back to the kitchen as it was (`undo_close_order`).
    say(t("toast.closed", { place: title }), {
      undo: () =>
        void actions
          .undoClose(id)
          .catch(() => null)
          .then((back) => {
            if (!back?.ok) {
              say(
                fixFailureWords(t, back ? back.failure : "failed", "undoClose"),
              );
            }
            mode.syncNow();
          }),
      focus: true,
      after: () => titleRef.current,
    });
  }

  async function moveTo(to: OrderPlace) {
    setMoving(false);
    if (!known || !place || frame.viewing) return;
    const id = known.id;
    const from = place;
    const there = placeTitle({ placeName: to.name, takeaway: null });
    const back = placeTitle({ placeName: from.name, takeaway: null });
    const result = await orderWrite(() => actions.move(id, to.id));
    if (!result?.ok) {
      say(
        fixFailureWords(t, result ? result.failure : "failed", "move", there),
      );
      return;
    }
    // The draft goes with the order (default 7), and back with its undo.
    const fromKey = draftKey({ place: from.id });
    const toKey = draftKey({ place: to.id });
    const went = drafts.get(fromKey).map((line) => line.id);
    drafts.move(fromKey, toKey);
    router.replace(paths.place(to.id));
    say(t("toast.moved", { place: there }), {
      undo: () =>
        void actions
          .move(id, from.id)
          .catch(() => null)
          .then((again) => {
            mode.syncNow();
            if (!again?.ok) {
              say(
                fixFailureWords(
                  t,
                  again ? again.failure : "failed",
                  "move",
                  back,
                ),
              );
              return;
            }
            drafts.move(toKey, fromKey, went);
            // This screen, hidden meanwhile, takes the focus once on show.
            if (!onScreen.current) backHere.current = true;
            router.replace(paths.place(from.id));
          }),
      // The row pressed went with the screen: the way back takes the focus,
      // and after it the title of the place on show.
      focus: true,
      after: () => titleOnShow(titleRef.current),
    });
  }

  const header = (
    <PageHeader
      back={{ href: paths.floor, label: t("order.noPlace.back") }}
      eyebrow={heading.eyebrow}
      title={title}
      headingRef={titleRef}
      subtitle={known ? <OrderHistory order={known} /> : t("order.free")}
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
    return closedOrder ? (
      <ClosedOrder order={closedOrder} headingRef={titleRef} />
    ) : (
      <NoPlace />
    );
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
        disabled={frame.viewing || cancelHeld}
        loading={busySending}
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

  // "ההזמנה כולה": closing, moving and cancelling, for an open order. Each
  // waits while a round of this screen is on its way, and says so: a close
  // would serve it before the kitchen saw it, or refuse it, and a move would
  // leave it refused at the old place, its lines in that place's draft.
  const sendOnWay = pending.length > 0 || busySending;
  const locked = frame.viewing || cancelHeld || busy || sendOnWay;
  const waitSend = sendOnWay ? t("order.actions.waitSend") : null;
  const whole =
    known && known.status === "open" ? (
      <PageSection title={t("order.actions.title")} headingRef={actionsHeading}>
        <ListGroup>
          <ListRow
            leading={<Receipt />}
            title={place ? t("close.place") : t("close.takeaway")}
            subtitle={
              waitSend ??
              (closing.held
                ? t("close.held")
                : closing.unserved.length > 0
                  ? t("close.unserved", {
                      departments: closing.unserved.map(department).join(", "),
                    })
                  : t("close.allServed"))
            }
            disabled={locked || closing.held}
            onClick={() => void close()}
          />
          {place ? (
            <ListRow
              leading={<ArrowLeftRight />}
              title={t("order.actions.move")}
              subtitle={
                waitSend ??
                (free.length > 0
                  ? t("order.actions.moveHint")
                  : t("order.actions.noFree"))
              }
              disabled={locked || free.length === 0}
              onClick={(event) =>
                openFrom(event.currentTarget, () => setMoving(true))
              }
            />
          ) : null}
          {frame.runs ? (
            <ListRow
              leading={<Ban />}
              title={t("order.actions.cancel")}
              subtitle={waitSend ?? t("order.actions.cancelHint")}
              disabled={locked || liveIds.length === 0}
              onClick={(event) =>
                openFrom(event.currentTarget, () => setCancelling(true))
              }
            />
          ) : null}
        </ListGroup>
      </PageSection>
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
        fixed={fixed}
        held={heldNow}
        onServe={(ticket) => void serve(ticket)}
        onFire={(ticket) => void fire(ticket)}
        onTakeBack={takeBack}
        onFix={(target, from) => openFrom(from, () => setSheet(target))}
      />
      {whole}
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

  const open = known && known.status === "open" ? known : null;
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
      {open ? (
        <>
          <LineSheet
            order={open}
            target={sheet}
            onClose={() => setSheet(null)}
            onPick={pickFix}
            returnFocus={() => backTo(roundsHeading.current)}
          />
          <MoveSheet
            open={moving}
            places={free}
            onClose={() => setMoving(false)}
            onPick={(to) => void moveTo(to)}
            returnFocus={() => backTo(actionsHeading.current)}
          />
          <CancelOrderSheet
            open={cancelling}
            place={title}
            count={liveItems}
            onClose={() => setCancelling(false)}
            onPick={cancelWhole}
            returnFocus={() => backTo(actionsHeading.current)}
          />
        </>
      ) : null}
    </PageBody>
  );
}

/**
 * Under the order's title: when and by whom it opened, and since P5 where
 * it moved from and when it opened again, with names on today's orders.
 */
function OrderHistory({ order }: { order: OrderDetail }) {
  const { t, time, person, placeTitle } = useOrderWords();
  const opener = person(order.openedBy);
  const mover = person(order.movedBy);
  const reopener = person(order.reopenedBy);
  const from =
    order.movedFrom !== null
      ? placeTitle({ placeName: order.movedFrom, takeaway: null })
      : null;
  return (
    <>
      <span className="block">
        {opener
          ? t.rich("order.opened", {
              time: time(order.openedAt),
              name: opener,
              ltr,
            })
          : t.rich("order.openedAt", { time: time(order.openedAt), ltr })}
      </span>
      {from && order.movedAt ? (
        <span className="block">
          {mover
            ? t.rich("order.movedFrom", {
                from,
                time: time(order.movedAt),
                name: mover,
                ltr,
              })
            : t.rich("order.movedFromAt", {
                from,
                time: time(order.movedAt),
                ltr,
              })}
        </span>
      ) : null}
      {order.reopenedAt ? (
        <span className="block">
          {reopener
            ? t.rich("order.reopened", {
                time: time(order.reopenedAt),
                name: reopener,
                ltr,
              })
            : t.rich("order.reopenedAt", {
                time: time(order.reopenedAt),
                ltr,
              })}
        </span>
      ) : null}
    </>
  );
}

/**
 * A takeaway closed or cancelled while its screen was on: its till, or back.
 * Its title is the screen's, where the focus goes after the close's toast.
 */
function ClosedOrder({
  order,
  headingRef,
}: {
  order: OrderDetail;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const { t } = useOrderWords();
  const { paths } = useOrdersMode();
  const cancelled = order.status === "cancelled";
  return (
    <PageBody>
      <EmptyState
        icon={<ReceiptText />}
        headingRef={headingRef}
        title={
          cancelled ? t("order.closed.cancelledTitle") : t("order.closed.title")
        }
        body={
          cancelled ? t("order.closed.cancelledBody") : t("order.closed.body")
        }
      >
        {cancelled ? null : (
          <Button asChild>
            <Link href={paths.till(order.id)}>
              <Receipt aria-hidden="true" />
              {t("rounds.till")}
            </Link>
          </Button>
        )}
        <Button asChild variant={cancelled ? "primary" : "secondary"}>
          <Link href={paths.floor}>{t("order.noPlace.back")}</Link>
        </Button>
      </EmptyState>
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
