import { AppShell, type NavItem } from "@ui/app-shell";
import {
  CalendarDays,
  House,
  Menu,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { business, totalOpenSlots, user } from "./data";

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
      href: "/design/shell/reservations",
      label: t("reservations"),
      icon: <UtensilsCrossed />,
    },
    { href: "/design/shell/team", label: t("team"), icon: <Users /> },
    { href: "/design/shell/more", label: t("more"), icon: <Menu /> },
  ];

  return (
    <AppShell
      businessName={business.name}
      user={{ ...user, href: "/design/shell/me" }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
