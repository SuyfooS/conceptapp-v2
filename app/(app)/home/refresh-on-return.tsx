"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const ONE_MINUTE = 60_000;

/**
 * Today says "in 48 minutes" and counts what waits, and a phone left in a
 * pocket comes back showing an old screen. So it asks for a fresh one when the
 * app returns to view, at most once a minute.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now();
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < ONE_MINUTE) return;
      last.current = Date.now();
      router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}
