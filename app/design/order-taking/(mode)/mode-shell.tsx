"use client";

import { AppShell, type NavItem } from "@ui/app-shell";
import { BookOpen, LayoutGrid, ListTodo, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { orderDemoBusiness, orderDemoUser, READER } from "../data";
import { useOrderDemo } from "../demo-store";
import { linesCount, paths, ticketsOf } from "../parts";
import { TwinOrdersMode } from "../twin-mode";

/**
 * The mode's items in the one shell (P4's `modes`), the same on phone,
 * tablet and desktop: the floor, what Shiran sent (with a count of what is
 * ready to serve), the prep screen and the menu (with a count of what is
 * sold out). She is a manager in the bar, so she sees all four; a waiter
 * outside a preparing department would not see "הכנה", and the menu is for
 * whoever runs it or prepares. The words are the app's, in the restaurant's
 * sentences.
 */
export function ModeShell({ children }: { children: ReactNode }) {
  const t = useTranslations("design.orderTaking");
  const tm = useTranslations("modules.order_taking");
  const { data } = useOrderDemo();
  const ready = ticketsOf(data).filter(
    ({ round, ticket }) =>
      round.by === READER && ticket.state === "ready" && linesCount(ticket) > 0,
  ).length;
  const nav: NavItem[] = [
    { href: paths.floor, label: tm("mode.places"), icon: <LayoutGrid /> },
    { href: paths.mine, label: tm("mode.mine"), icon: <Send />, count: ready },
    { href: paths.prep, label: tm("mode.prep"), icon: <ListTodo /> },
    {
      href: paths.menu,
      label: tm("mode.menu"),
      icon: <BookOpen />,
      count: data.soldOut.length,
    },
  ];
  return (
    <AppShell
      businessName={orderDemoBusiness}
      modes={[{ href: paths.index, name: t("mode"), nav }]}
      user={{ ...orderDemoUser, href: "/design/shell/me" }}
      nav={nav}
    >
      <TwinOrdersMode>{children}</TwinOrdersMode>
    </AppShell>
  );
}
