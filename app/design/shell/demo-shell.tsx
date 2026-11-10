"use client";

import { AppShell, type AppShellProps } from "@ui/app-shell";
import { usePathname } from "next/navigation";

const HOME = "/design/shell";
const VIEW_AS = "/design/shell/view-as";

/**
 * Where the switcher's twins are (payroll P3b): the demo's accountant, who
 * keeps the books of two businesses, so the sidebar names the business as a
 * menu of both, and shows her, with her tabs.
 */
const BUSINESSES_TWINS = [
  "/design/shell/today/businesses",
  "/design/shell/me/businesses",
];

/**
 * The demo's shell. Home carries what needs Shiran in her inbox, as the app's
 * Home does, except while the demo views the business as a role: in the app
 * that count is the signed-in person's own, and a view session has none. On
 * the switcher's twins the shell is the demo's accountant's: her name and
 * role at the foot of the sidebar, an accountant's tabs (Home and the hours
 * for pay, nothing of the staff's), and the business's name as a menu of
 * her businesses.
 */
export function DemoShell({
  homeCount,
  nav,
  user,
  businesses,
  accountant,
  ...props
}: AppShellProps & {
  homeCount: number;
  /** Who the switcher's twins show instead of Shiran, and their tabs. */
  accountant: Pick<AppShellProps, "user" | "nav">;
}) {
  const pathname = usePathname();
  if (BUSINESSES_TWINS.includes(pathname)) {
    return (
      <AppShell
        nav={accountant.nav}
        user={accountant.user}
        businesses={businesses}
        {...props}
      />
    );
  }
  const viewing = pathname === VIEW_AS || pathname.startsWith(`${VIEW_AS}/`);
  const items =
    viewing || homeCount === 0
      ? nav
      : nav.map((item) =>
          item.href === HOME ? { ...item, count: homeCount } : item,
        );
  return <AppShell nav={items} user={user} businesses={null} {...props} />;
}
