"use client";

import { AppShell, type AppShellProps } from "@ui/app-shell";
import { usePathname } from "next/navigation";

const HOME = "/design/shell";
const VIEW_AS = "/design/shell/view-as";

/**
 * The demo's shell. Home carries what needs Shiran in her inbox, as the app's
 * Home does, except while the demo views the business as a role: in the app
 * that count is the signed-in person's own, and a view session has none.
 */
export function DemoShell({
  homeCount,
  nav,
  ...props
}: AppShellProps & { homeCount: number }) {
  const pathname = usePathname();
  const viewing = pathname === VIEW_AS || pathname.startsWith(`${VIEW_AS}/`);
  const items =
    viewing || homeCount === 0
      ? nav
      : nav.map((item) =>
          item.href === HOME ? { ...item, count: homeCount } : item,
        );
  return <AppShell nav={items} {...props} />;
}
