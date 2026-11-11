"use client";

import { useEffect, useRef } from "react";

/**
 * Marks a screen that takes the whole phone, as a conversation does: while
 * it is on the page, AppShell hides the phone's tab bar (and the Composer
 * takes its place). From tablet up nothing changes.
 *
 * The mark is in the server's HTML, so the bar never shows first and then
 * goes. A screen kept hidden for going back (cacheComponents keeps the last
 * page in React's Activity) has its effects cleaned up, and that drops the
 * mark, so the list one goes back to has its bar again.
 */
export function ImmersiveScreen() {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = mark.current;
    node?.setAttribute("data-immersive", "");
    return () => node?.removeAttribute("data-immersive");
  }, []);
  return <span ref={mark} hidden data-immersive="" />;
}
