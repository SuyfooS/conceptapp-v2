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
import { newsGate } from "./news-gate";
import type {
  DraftStore,
  OrdersActions,
  OrdersFrame,
  OrdersPaths,
  OrdersSender,
  Say,
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
  say: Say;
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
  /** Which toast this is, for its withdrawal. */
  id: number;
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
 * pressed for (a ticket turned ready): it never takes the place of a way
 * back still offered, and waits until that toast has gone; the newest news
 * waiting is told then, once.
 */
export function useModeToast(): {
  say: Say;
  tell: (show: () => void) => void;
  toast: ReactNode;
} {
  const t = useTranslations("app.orders.toast");
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const shown = useRef<Toast | null>(null);
  shown.current = toast;
  const after = useRef<(() => HTMLElement | null | undefined) | null>(null);
  /** News waits while a way back is offered on screen. */
  const [gate] = useState(newsGate);
  /** The toast that last heard it stopped counting, and whether it still is. */
  const told = useRef<{ toast: Toast; waiting: boolean } | null>(null);
  const said = useRef(0);

  const say = useCallback<Say>(
    (text, options = {}) => {
      // A toast that waited for the person hears it goes on, as it goes: what
      // its way back holds (a take-back) lands then, never stays held.
      if (told.current?.waiting) told.current.toast.onWaitingChange?.(false);
      told.current = null;
      after.current = options.after ?? null;
      gate.said(Boolean(options.undo));
      said.current += 1;
      const id = said.current;
      setToast({
        id,
        text,
        stamp: Date.now(),
        undo: options.undo ?? null,
        open: options.open ?? null,
        focus: Boolean((options.undo || options.open) && options.focus),
        onWaitingChange: options.onWaitingChange ?? null,
      });
      // Only this toast, while it still shows: a newer one stays. It goes at
      // once (StatusToast), and the news it held back is told then.
      return () => {
        if (told.current?.toast.id === id) told.current = null;
        setToast((was) => (was?.id === id ? null : was));
      };
    },
    [gate],
  );
  const onWaitingChange = useCallback((waiting: boolean) => {
    const current = shown.current;
    if (!current?.onWaitingChange) return;
    told.current = { toast: current, waiting };
    current.onWaitingChange(waiting);
  }, []);

  const action = toast?.undo
    ? {
        label: t("undo"),
        onClick: () => {
          // The way back lets go of what it held: nothing to go on with.
          told.current = null;
          toast.undo?.();
          setToast(null);
        },
      }
    : toast?.open
      ? {
          label: t("open"),
          onClick: () => {
            if (toast.open) router.push(toast.open);
            setToast(null);
          },
        }
      : null;
  const element = (
    <StatusToast
      message={toast?.text ?? null}
      stamp={toast ? String(toast.stamp) : undefined}
      duration={toast?.undo || toast?.open ? 8000 : 4000}
      action={action}
      focusAction={toast?.focus ?? false}
      onFocusLeave={() => after.current?.()?.focus({ preventScroll: true })}
      onWaitingChange={toast?.onWaitingChange ? onWaitingChange : undefined}
      onHidden={gate.hidden}
    />
  );
  return { say, tell: gate.tell, toast: element };
}
