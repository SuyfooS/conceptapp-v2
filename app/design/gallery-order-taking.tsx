"use client";

import { formatShekels, moneyLocale } from "@domain/money";
import { MenuItemList, MenuItemRow } from "@ui/menu-item-row";
import { PlaceTile } from "@ui/place-tile";
import { OrderLine, TicketCard } from "@ui/ticket-card";
import { TillList } from "@ui/till-list";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Where the tiles lead: the twin's floor, as the evening is. */
const FLOOR = "/design/order-taking/floor?state=service";

/**
 * Waiter mode's parts (S0, #191): a place on the floor in each of its
 * states, a ticket on a prep screen with its lines (choices, a note, an
 * allergy, one taken back) and a held block, what to ring up at the till,
 * and the items an order adds with one tap. The words are the twin's; the
 * dishes and people only stand in.
 */
export function GalleryOrderTaking() {
  const t = useTranslations("design.orderParts");
  const o = useTranslations("design.orderTaking");
  const locale = moneyLocale(useLocale());
  const price = (agorot: number) => (
    <span dir="ltr" className="tabular-nums">
      {formatShekels(agorot, locale)}
    </span>
  );
  // One tap adds a lemonade, and the till's list counts it.
  const [lemonades, setLemonades] = useState(2);
  const kitchen = t("kitchen");
  const table = (name: string) => o("place.table", { name });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2 text-sm">{t("text")}</p>

      <h3 className="font-semibold text-base">{t("tiles")}</h3>
      <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-5">
        {(
          [
            { name: "6", tone: "free", state: o("floor.state.free") },
            {
              name: "8",
              tone: "draft",
              state: o("floor.state.draft", { count: 3 }),
            },
            {
              name: "4",
              tone: "open",
              state: o("floor.state.open", { count: 6 }),
              by: t("waiter"),
            },
            {
              name: "11",
              tone: "ready",
              state: o("floor.state.ready"),
              by: t("waiter"),
            },
            {
              name: "9",
              tone: "late",
              state: o("floor.state.late", { count: 20 }),
              by: t("waiter"),
            },
          ] as const
        ).map((tile) => (
          <li key={tile.name} className="flex">
            <PlaceTile
              href={FLOOR}
              kind={o("place.tableWord")}
              name={tile.name}
              state={tile.state}
              tone={tile.tone}
              by={"by" in tile ? tile.by : null}
            />
          </li>
        ))}
      </ul>

      <h3 className="font-semibold text-base">{t("tickets")}</h3>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <TicketCard
          title={table("4")}
          label={o("ticket.label", { place: table("4"), department: kitchen })}
          from={o("ticket.from", { name: t("waiter"), department: kitchen })}
          age={{ text: o("age.ago", { count: 18 }), tone: "late" }}
          ready={{ label: o("ticket.ready"), onClick: () => {} }}
        >
          <OrderLine
            title={o.rich("line.qtyName", { qty: 1, name: t("burger"), ltr })}
            choices={[t("medium"), t("cheese")]}
            allergy={o("line.allergy", { allergy: t("sesame") })}
          />
          <OrderLine
            title={o.rich("line.qtyName", { qty: 2, name: t("hummus"), ltr })}
            note={o("line.note", { note: t("noGarlic") })}
          />
          <OrderLine
            title={o.rich("line.qtyName", { qty: 1, name: t("fish"), ltr })}
            takenBack={o("line.takenBack")}
          />
        </TicketCard>
        <TicketCard
          title={table("7")}
          label={o("ticket.label", { place: table("7"), department: kitchen })}
          from={o("ticket.from", { name: t("waiter"), department: kitchen })}
          age={{ text: o("age.ago", { count: 3 }), tone: "calm" }}
          held={o("ticketState.held")}
        >
          <OrderLine
            title={o.rich("line.qtyName", {
              qty: 1,
              name: t("schnitzel"),
              ltr,
            })}
            choices={[t("mash")]}
          />
        </TicketCard>
      </div>

      <h3 className="font-semibold text-base">{t("till")}</h3>
      <TillList
        label={o("till.byItem")}
        rows={[
          {
            key: "burger",
            qty: 1,
            name: t("burger"),
            choices: [t("medium"), t("cheese")],
            price: price(7400),
          },
          { key: "hummus", qty: 2, name: t("hummus"), price: price(3200) },
          {
            key: "lemonade",
            qty: lemonades,
            name: t("lemonade"),
            price: price(1600),
          },
        ]}
        empty={o("till.empty")}
        qtyLabel={o("till.qty")}
        priceLabel={o("till.unit")}
      />

      <h3 className="font-semibold text-base">{t("items")}</h3>
      <MenuItemList aria-label={t("items")}>
        <MenuItemRow
          name={t("lemonade")}
          detail={price(1600)}
          count={lemonades}
          countLabel={o("picker.inDraft")}
          onPick={() => setLemonades((n) => n + 1)}
        />
        <MenuItemRow
          name={t("burger")}
          detail={
            <>
              {price(6800)} · {o("picker.withChoices")}
            </>
          }
          count={0}
          countLabel={o("picker.inDraft")}
          onPick={() => {}}
        />
        <MenuItemRow
          name={t("fish")}
          detail={price(8400)}
          count={0}
          countLabel={o("picker.inDraft")}
          soldOut={o("picker.soldOut")}
          onPick={() => {}}
        />
      </MenuItemList>
    </div>
  );
}
