"use client";

import { AppShell, type NavItem } from "@ui/app-shell";
import { BookOpen, LayoutGrid, ListTodo, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { orderDemoBusiness, orderDemoUser, READER } from "../data";
import { useOrderDemo } from "../demo-store";
import { linesCount, paths, ticketsOf } from "../parts";

/**
 * The mode's items, the same on phone, tablet and desktop: the floor, what
 * Shiran sent (with a count of what is ready to serve), the prep screen
 * and the menu (with a count of what is sold out). She is a manager in the
 * bar, so she sees all four; a waiter outside a preparing department would
 * not see "הכנה", and only `order_taking.edit` sees "תפריט".
 */
export function ModeShell({ children }: { children: ReactNode }) {
  const t = useTranslations("design.orderTaking");
  const { data } = useOrderDemo();
  const ready = ticketsOf(data).filter(
    ({ round, ticket }) =>
      round.by === READER && ticket.state === "ready" && linesCount(ticket) > 0,
  ).length;
  const nav: NavItem[] = [
    { href: paths.floor, label: t("nav.places"), icon: <LayoutGrid /> },
    { href: paths.mine, label: t("nav.mine"), icon: <Send />, count: ready },
    { href: paths.prep, label: t("nav.prep"), icon: <ListTodo /> },
    {
      href: paths.menu,
      label: t("nav.menu"),
      icon: <BookOpen />,
      count: data.soldOut.length,
    },
  ];
  return (
    <AppShell
      businessName={orderDemoBusiness}
      mode={t("mode")}
      user={{ ...orderDemoUser, href: "/design/shell/me" }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
