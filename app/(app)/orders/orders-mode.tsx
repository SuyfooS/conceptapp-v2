"use client";

import { StatusToast } from "@ui/status-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { modeToast, type ShownToast } from "./mode-toast";
import type {
  DraftStore,
  OrdersActionResult,
  OrdersActions,
  OrdersFrame,
  OrdersPaths,
  OrdersSender,
  Say,
  Tell,
  WholeRefusal,
  WholeWrite,
} from "./orders-types";

/**
 * What every screen of the mode reads besides its own data (waiter mode P4):
 * the person and the business, where things are, the clock the server
 * keeps, whether a taker is off a shift, the drafts on the phone, the send,
 * the other writes, the mode's one toast and a sync now. The app's provider
 * (orders-provider.tsx) gives it over the routes; the twin's over its store.
 */
export type OrdersModeValue = {
  frame: OrdersFrame;
  paths: OrdersPaths;
  /** The server's clock, in milliseconds, moving every 10 seconds. */
  now: number;
  /**
   * Why a send waits for a shift now: off one, or a shift left open. The
   * frame's, then what the sync and a refused send heard since.
   */
  clock: "clock" | "staleShift" | null;
  /** A taker off a shift, or with a shift left open: their screens wait. */
  off: "clock" | "staleShift" | null;
  drafts: DraftStore;
  sender: OrdersSender;
  actions: OrdersActions;
  /**
   * Writes an order whole (P5: a close, a move, the "ביטול" of either, a
   * reopen) with `write`, kept on its way until it answers, and once written
   * until a read made after it has landed, whichever screen sent it
   * (`wholeOnWay`); and asks the server again. It never goes while a round
   * of a draft it names is on its way, nor while another write of its order
   * has not answered, read as the tab has it now: it answers why then
   * (`wholeRefusal`), and nothing was written.
   */
  whole: (
    on: WholeWrite,
    write: () => Promise<OrdersActionResult>,
  ) => Promise<OrdersActionResult>;
  /**
   * Why `whole` would hold `on` back now, or null, decided at once: a way
   * back pressed on the toast is offered again, or says why, before the
   * toast lets go of the news waiting behind it.
   */
  wholeRefusal: (on: WholeWrite) => WholeRefusal | null;
  /**
   * Whether a write of the order whole is on its way for `order` or touching
   * `draft`: meanwhile no send goes there, and nothing sent is fixed, served
   * or fired, on any screen of the mode.
   */
  wholeOnWay: (order: string | null, draft: string) => boolean;
  say: Say;
  /**
   * News nobody pressed for (a send answered after its screen was left):
   * never in the place of a way back still offered.
   */
  tell: Tell;
  /** Asks the server again now, after one's own write. */
  syncNow: () => void;
  /** A new id for a draft line. */
  newId: () => string;
};

export const OrdersModeContext = createContext<OrdersModeValue | null>(null);

/** The mode's shared state; only inside a provider of it. */
export function useOrdersMode(): OrdersModeValue {
  const value = useContext(OrdersModeContext);
  if (!value) throw new Error("useOrdersMode outside the mode");
  return value;
}

type Toast = {
  text: string;
  stamp: number;
  undo: (() => void) | null;
  open: string | null;
  focus: boolean;
  onWaitingChange: ((waiting: boolean) => void) | null;
};

/**
 * The mode's one toast (S0's, moved here): what just happened, with
 * "ביטול" for 8 seconds for what can be undone rather than an "are you
 * sure", or "פתיחה" to what it names (a ticket ready, from another screen).
 * When what was pressed went away with the change, the keyboard's focus goes
 * to the way back, and after it to `after`.
 *
 * `say` is for what the person just did, and takes the toast's place; what
 * it returns takes that toast away again while it still shows, for a way
 * back that no longer is one (a take-back sent on leaving its screen, while
 * the toast stays over the mode's other screens). `tell` is for news nobody
 * pressed for (a ticket turned ready, a round that landed with no screen
 * waiting for it): it never takes the place of a way back still offered,
 * and waits until that toast has gone; then what waited is told in turn,
 * each once, the newest of each. The rules are mode-toast.ts's, with its
 * tests.
 */
export function useModeToast(): {
  say: Say;
  tell: Tell;
  toast: ReactNode;
} {
  const t = useTranslations("app.orders.toast");
  const router = useRouter();
  const [toast, setToast] = useState<ShownToast<Toast> | null>(null);
  const [slot] = useState(() => modeToast<Toast>(setToast));
  const after = useRef<(() => HTMLElement | null | undefined) | null>(null);

  const say = useCallback<Say>(
    (text, options = {}) => {
      after.current = options.after ?? null;
      return slot.say({
        text,
        stamp: Date.now(),
        undo: options.undo ?? null,
        open: options.open ?? null,
        focus: Boolean((options.undo || options.open) && options.focus),
        onWaitingChange: options.onWaitingChange ?? null,
      });
    },
    [slot],
  );

  const action = toast?.undo
    ? { label: t("undo"), onClick: slot.undo }
    : toast?.open
      ? {
          label: t("open"),
          onClick: () => {
            if (toast.open) router.push(toast.open);
            slot.close();
          },
        }
      : null;
  const shownId = toast?.id ?? null;
  const element = (
    <StatusToast
      message={toast?.text ?? null}
      stamp={toast ? String(toast.stamp) : undefined}
      duration={toast?.undo || toast?.open ? 8000 : 4000}
      action={action}
      focusAction={toast?.focus ?? false}
      onFocusLeave={() => after.current?.()?.focus({ preventScroll: true })}
      onWaitingChange={toast?.onWaitingChange ? slot.waiting : undefined}
      onHidden={() => slot.hidden(shownId)}
    />
  );
  return { say, tell: slot.tell, toast: element };
}
