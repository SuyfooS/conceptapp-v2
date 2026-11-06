import { useCallback, useEffect, useState } from "react";

/**
 * Keeps unsaved work from vanishing without a word. While `active`, a tap on
 * any link in the app (the tab bar, the sidebar, "back") is held back and its
 * destination returned as `target`, for the screen to ask what to do; closing
 * or reloading the page gets the browser's own warning.
 *
 * The listener sits on the document, in the capture phase, so it sees a tap
 * before the link does. React's own capture handlers run first, which leaves
 * the shrunk tab bar's "first tap only opens the bar" alone: that tap arrives
 * here already prevented.
 *
 * It cannot hold back the browser's back button or swipe: the framework gives
 * no way to stop those.
 */
export function useLeaveGuard(active: boolean) {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setTarget(`${url.pathname}${url.search}${url.hash}`);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  return { target, clear: useCallback(() => setTarget(null), []) };
}
