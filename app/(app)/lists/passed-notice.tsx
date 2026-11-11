"use client";

import { StatusToast } from "@ui/status-toast";
import { useEffect } from "react";

/**
 * Right after passing a list on, for someone who no longer reads it (L5):
 * the list's screen comes back to Lists with `?passed=`, and this says where
 * it went, once. The address then loses `?passed=`, so a reload or a shared
 * link doesn't say it again.
 */
export function PassedNotice({ message }: { message: string | null }) {
  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("passed")) return;
    url.searchParams.delete("passed");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [message]);
  return <StatusToast message={message} />;
}
