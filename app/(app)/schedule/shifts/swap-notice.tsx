"use client";

import { StatusToast } from "@ui/status-toast";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { SwapIntent } from "./actions";
import { SWAP_DONE } from "./swap-focus";

export type SwapNotice = { intent: SwapIntent; stamp: number } | null;

/**
 * The last swap step that went through on a board, for its toast; each step
 * a new stamp, so the same step twice is said twice.
 */
export function useSwapNotice() {
  const [notice, setNotice] = useState<SwapNotice>(null);
  const onSwapped = useCallback((intent: SwapIntent) => {
    setNotice((last) => ({ intent, stamp: (last?.stamp ?? 0) + 1 }));
  }, []);
  return { notice, onSwapped };
}

/**
 * Says what came of a swap step (`SWAP_DONE`): the shift offered, taken or
 * kept. The card says it too, once the screen is read again; the toast is
 * what a screen reader hears, from the sheet that closed or the card whose
 * button went. "המשמרות שלי" says a take with the offer's own words, where
 * the focus lands, and no toast.
 */
export function SwapToast({ notice }: { notice: SwapNotice }) {
  const t = useTranslations("app");
  return (
    <StatusToast
      message={notice ? t(SWAP_DONE[notice.intent]) : null}
      stamp={notice ? String(notice.stamp) : undefined}
    />
  );
}
