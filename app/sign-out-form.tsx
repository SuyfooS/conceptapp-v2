"use client";

import type { ReactNode } from "react";

/**
 * Signs out, and says where the next person starts (the sign-in door), or
 * null where nothing is signed in (the design demo's stand-in).
 */
export type SignOutAction = () => Promise<string | null>;

/**
 * A sign-out button's form. Signing out ends with a whole new page where the
 * action says, never a move inside the app: React keeps the screens it drew,
 * and what they hold, across moves and sign-ins alike (cacheComponents keeps
 * them for going back), so on a shared phone the next person would otherwise
 * find the last one's chats, drafts and lists still in the page. The page is
 * loaded here, after the action answers, and not by a screen of the app:
 * signing out draws the signed-out app again at once, which may already be
 * on its way to the door, and takes such a screen with it.
 */
export function SignOutForm({
  action,
  className,
  children,
}: {
  action: SignOutAction;
  className?: string;
  /** The button that sends it. */
  children: ReactNode;
}) {
  return (
    <form
      action={async () => {
        const to = await action();
        if (to) window.location.replace(to);
      }}
      className={className}
    >
      {children}
    </form>
  );
}
