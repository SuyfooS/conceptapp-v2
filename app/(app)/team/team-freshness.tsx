"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// When someone was last taken off the team in this tab, and when the Team
// screen last read its list after it: kept in the module, so it lasts while
// the tab moves between screens and is gone with the tab.
let changedAt = 0;
let readAt = 0;

/**
 * Someone was taken off the team from their page. Their removal revalidates
 * nothing, so that page keeps saying what came off them
 * (`removeMemberAction`), and a Team screen kept for the way back (the
 * phone's back button) would still list them: `TeamFreshness` reads it again
 * when it is shown next.
 */
export function markTeamChanged(): void {
  changedAt = Date.now();
}

/**
 * On the Team screen: shown again after someone was taken off the team in
 * this tab, it reads its list again, once.
 */
export function TeamFreshness() {
  const router = useRouter();
  useEffect(() => {
    if (changedAt <= readAt) return;
    readAt = changedAt;
    router.refresh();
  }, [router]);
  return null;
}
