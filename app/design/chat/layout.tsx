import { AppShell, type NavItem } from "@ui/app-shell";
import {
  CalendarDays,
  Clock,
  House,
  ListChecks,
  MessageCircle,
} from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { user } from "../shell/data";
import { chatDemoBusiness, chatDemoConversations } from "./data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("design");
  return {
    title: t("chatMetaTitle"),
    robots: { index: false, follow: false },
  };
}

// The chat with mock data (C2), as Shiran has it with chat switched on: the
// app's bar of Home, Schedule, Clock, Lists and Chat, the list, and a
// conversation in the phone's, the tablet's and the desktop's shapes.
export default function ChatDemoLayout({
  children,
}: LayoutProps<"/design/chat">) {
  const t = useTranslations("shell.nav");
  const tModules = useTranslations("modules");
  // The tab counts the conversations with something unread, as the app's does.
  const unread = chatDemoConversations.filter((c) => c.unread > 0).length;
  const nav: NavItem[] = [
    { href: "/design/shell", label: t("home"), icon: <House />, exact: true },
    {
      href: "/design/shell/schedule",
      label: tModules("scheduling.name"),
      icon: <CalendarDays />,
    },
    {
      href: "/design/shell/clock",
      label: tModules("time_clock.name"),
      icon: <Clock />,
    },
    {
      href: "/design/shell/lists",
      label: tModules("lists.name"),
      icon: <ListChecks />,
    },
    {
      href: "/design/chat",
      label: tModules("chat.name"),
      icon: <MessageCircle />,
      count: unread,
    },
  ];
  return (
    <AppShell
      businessName={chatDemoBusiness}
      user={{ ...user, href: "/design/shell/me" }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
