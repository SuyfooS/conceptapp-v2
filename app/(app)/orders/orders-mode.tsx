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
 */
export function useModeToast(): { say: Say; toast: ReactNode } {
  const t = useTranslations("app.orders.toast");
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const after = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const say = useCallback<Say>((text, options = {}) => {
    after.current = options.after ?? null;
    setToast({
      text,
      stamp: Date.now(),
      undo: options.undo ?? null,
      open: options.open ?? null,
      focus: Boolean((options.undo || options.open) && options.focus),
      onWaitingChange: options.onWaitingChange ?? null,
    });
  }, []);
  const action = toast?.undo
    ? {
        label: t("undo"),
        onClick: () => {
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
      onWaitingChange={toast?.onWaitingChange ?? undefined}
    />
  );
  return { say, toast: element };
}
