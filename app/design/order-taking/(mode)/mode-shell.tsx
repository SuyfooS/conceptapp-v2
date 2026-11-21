"use client";

import { AppShell, type NavItem } from "@ui/app-shell";
import { BookOpen, LayoutGrid, ListTodo, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { usePlaceWords } from "../../../(app)/orders/orders-parts";
import { LostOrdersNoticeView } from "../../../(app)/orders/outbox-notice";
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
 * sentences. Above the screen, as the app's frame draws it, the notice of a
 * round taken off the phone (`?state=lost`, P7), until "הבנתי".
 */
export function ModeShell({ children }: { children: ReactNode }) {
  const t = useTranslations("design.orderTaking");
  const tm = useTranslations("modules.order_taking");
  const { data, update } = useOrderDemo();
  const { placeTitle } = usePlaceWords();
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
      {data.lost ? (
        <LostOrdersNoticeView
          notice={{
            count: data.lost.count,
            places: data.lost.placeNames.map((name) =>
              placeTitle({ placeName: name, takeaway: null }),
            ),
            why: data.lost.why,
          }}
          onSeen={() => update((d) => ({ ...d, lost: null }))}
        />
      ) : null}
      <TwinOrdersMode>{children}</TwinOrdersMode>
    </AppShell>
  );
}
