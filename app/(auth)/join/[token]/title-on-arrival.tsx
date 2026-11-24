"use client";

import { focusFirst } from "@ui/focus-after";
import { useEffect } from "react";

/**
 * The focus on the page's title as its screen arrives, where it was lost:
 * a link that stopped working on the way (it expired, or was used or
 * deleted meanwhile) sends the press back to its own page, whose address
 * and tab title don't change, so nothing else says why; the press that
 * had the focus was busy, then gone. Opened afresh, the page starts there
 * too. Never from where the person put it, and without moving the page.
 */
export function TitleOnArrival() {
  useEffect(() => {
    focusFirst([]);
  }, []);
  return null;
}
