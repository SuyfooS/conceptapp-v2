"use client";

import { formatShekels, moneyLocale } from "@domain/money";
import { MenuEditRow, MenuItemList, MenuItemRow } from "@ui/menu-item-row";
import { DraftLineRow, SendOrderButton } from "@ui/order-draft";
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
 * the items an order adds with one tap, and the menu's rows to edit (P2):
 * one switched sold out, one that reaches no department, and two read only.
 * P4 adds the draft's line with its note, allergy and hold, the send, and
 * "מוכן" while the server hears it. The words are the twin's and the
 * app's; the dishes and people only stand in.
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
  // The editor's schnitzel switches sold out and back.
  const [schnitzelOut, setSchnitzelOut] = useState(false);
  const m = useTranslations("app.orders.menu");
  const a = useTranslations("app.orders");
  // The draft's hummus counts up and down, and holds for later.
  const [hummus, setHummus] = useState(2);
  const [held, setHeld] = useState(true);
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

      <h3 className="font-semibold text-base">{t("draft")}</h3>
      <p className="text-ink-2 text-sm">{t("draftText")}</p>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-3">
          <ul className="overflow-hidden rounded-card bg-surface shadow-card">
            {(
              [
                {
                  key: "burger",
                  name: t("burger"),
                  choices: [t("medium"), t("cheese")],
                  agorot: 7400,
                  quantity: 1,
                  allergy: t("peanuts"),
                  held: false,
                },
                {
                  key: "hummus",
                  name: t("hummus"),
                  choices: [],
                  agorot: 3200,
                  quantity: hummus,
                  allergy: null,
                  held,
                },
              ] as const
            ).map((row) => (
              <DraftLineRow
                key={row.key}
                name={row.name}
                choices={row.choices}
                price={price(row.agorot)}
                quantity={row.quantity}
                onQuantity={row.key === "hummus" ? setHummus : () => {}}
                quantityLabels={{
                  label: a("draft.qty", { name: row.name }),
                  less: a("draft.less", { name: row.name }),
                  more: a("draft.more", { name: row.name }),
                }}
                allergy={
                  row.allergy ? a("line.allergy", { note: row.allergy }) : null
                }
                held={row.held ? a("draft.heldBadge") : null}
                noteButton={{
                  label: a("draft.note"),
                  forItem: a("draft.forItem", { name: row.name }),
                  onClick: () => {},
                }}
                allergyButton={{
                  label: a("draft.allergy"),
                  forItem: a("draft.forItem", { name: row.name }),
                  onClick: () => {},
                }}
                holdButton={{
                  label: a("draft.hold"),
                  forItem: a("draft.forItem", { name: row.name }),
                  pressed: row.held,
                  onClick: () => {
                    if (row.key === "hummus") setHeld((h) => !h);
                  },
                }}
                remove={{
                  label: a("draft.remove", { name: row.name }),
                  onClick: () => {},
                }}
              />
            ))}
          </ul>
          <SendOrderButton
            label={a("send.label")}
            count={a("send.count", { count: hummus + 1 })}
            routes={a("send.route", { department: kitchen, count: hummus + 1 })}
            onClick={() => {}}
          />
        </div>
        <TicketCard
          title={table("9")}
          label={o("ticket.label", { place: table("9"), department: t("bar") })}
          from={o("ticket.from", { name: t("waiter"), department: t("bar") })}
          age={{ text: o("age.ago", { count: 1 }), tone: "calm" }}
          ready={{ label: o("ticket.ready"), onClick: () => {}, loading: true }}
        >
          <OrderLine
            title={o.rich("line.qtyName", { qty: 2, name: t("lemonade"), ltr })}
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

      <h3 className="font-semibold text-base">{t("edit.title")}</h3>
      <p className="text-ink-2 text-sm">{t("edit.text")}</p>
      <MenuItemList aria-label={t("edit.title")}>
        <MenuEditRow
          name={t("schnitzel")}
          detail={price(6200)}
          onEdit={() => {}}
          soldOut={{
            checked: schnitzelOut,
            label: m("soldOutFor", { name: t("schnitzel") }),
            word: m("soldOut"),
            onChange: setSchnitzelOut,
          }}
        />
        <MenuEditRow
          name={t("burger")}
          detail={
            <>
              {price(6800)} · {m("choices", { count: 2 })}
            </>
          }
          flag={m("noRoute")}
          onEdit={() => {}}
          soldOut={{
            checked: false,
            label: m("soldOutFor", { name: t("burger") }),
            word: m("soldOut"),
            onChange: () => {},
          }}
        />
        <MenuEditRow
          name={t("fish")}
          detail={price(8400)}
          soldOut={{
            checked: true,
            label: m("soldOutFor", { name: t("fish") }),
            word: m("soldOut"),
          }}
        />
        <MenuEditRow
          name={t("edit.cola")}
          detail={price(1200)}
          soldOut={{
            checked: false,
            label: m("soldOutFor", { name: t("edit.cola") }),
            word: m("soldOut"),
          }}
        />
      </MenuItemList>
    </div>
  );
}
