import { needsAction } from "@domain/notifications";
import type { NavItem } from "@ui/app-shell";
import {
  CalendarDays,
  Clock,
  House,
  ListChecks,
  Menu,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { demoSwitcher } from "./businesses";
import { demoAccountantName } from "./clock/pay/data";
import { business, totalOpenSlots, user } from "./data";
import { DemoShell } from "./demo-shell";
import { demoUnread } from "./notifications/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

// Layout demo with mock data: the same app in phone, tablet and desktop form.
export default function ShellDemoLayout({
  children,
}: LayoutProps<"/design/shell">) {
  const t = useTranslations("shell.nav");
  const tModules = useTranslations("modules");
  const tRoles = useTranslations("app.roles");
  const nav: NavItem[] = [
    {
      href: "/design/shell",
      label: t("home"),
      icon: <House />,
      exact: true,
    },
    {
      href: "/design/shell/schedule",
      label: t("schedule"),
      icon: <CalendarDays />,
      count: totalOpenSlots,
    },
    {
      href: "/design/shell/lists",
      label: t("lists"),
      icon: <ListChecks />,
    },
    { href: "/design/shell/team", label: t("team"), icon: <Users /> },
    { href: "/design/shell/more", label: t("more"), icon: <Menu /> },
  ];
  // The demo's accountant's tabs, as the app gives someone off the staff:
  // Home, and the clock's tab for the books (`moduleNav`'s `outsideStaff`).
  const accountantNav: NavItem[] = [
    {
      href: "/design/shell/today/businesses",
      label: t("home"),
      icon: <House />,
      exact: true,
    },
    {
      href: "/design/shell/clock/pay",
      label: tModules("time_clock.outsideNav"),
      icon: <Clock />,
    },
  ];
  // Home counts, by the app's own rule, the lines in Shiran's inbox that need
  // her to act: hours to confirm, a swap to approve and a shift she could take.
  const toAct = demoUnread.filter((row) => needsAction(row.kind)).length;

  return (
    <DemoShell
      businessName={business.name}
      user={{ ...user, href: "/design/shell/me" }}
      nav={nav}
      homeCount={toAct}
      // The switcher's twins (payroll P3b) name the business as a menu, and
      // are the demo's accountant's own: her name, her role and her tabs.
      businesses={demoSwitcher()}
      accountant={{
        user: {
          name: demoAccountantName,
          role: tRoles("accountant"),
          photo: null,
          href: "/design/shell/me/businesses",
        },
        nav: accountantNav,
      }}
    >
      {children}
    </DemoShell>
  );
}
