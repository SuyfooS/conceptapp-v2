import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Whether going to `url` from `here` leaves the screen: another page, or the
 * builder's other week (`?week=`), which is another week's work. The same
 * page and week (a hash, another parameter) stays.
 */
export function leavesScreen(url: URL, here: URL): boolean {
  if (url.origin !== here.origin) return false;
  if (url.pathname !== here.pathname) return true;
  return url.searchParams.get("week") !== here.searchParams.get("week");
}

/**
 * Keeps unsaved work from vanishing without a word. While `active`, a tap on
 * any link in the app (the tab bar, the sidebar, "back", the switch to the
 * other week) is held back and its destination returned as `target`, for the
 * screen to ask what to do; closing or reloading the page gets the browser's
 * own warning. A navigation started in code goes through `leave`, which holds
 * it back the same way, or goes straight there while nothing is unsaved.
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
  const router = useRouter();
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
      if (!leavesScreen(url, new URL(window.location.href))) return;
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

  const leave = useCallback(
    (to: string) => {
      if (active) setTarget(to);
      else router.push(to);
    },
    [active, router],
  );

  return { target, clear: useCallback(() => setTarget(null), []), leave };
}
