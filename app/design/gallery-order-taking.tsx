"use client";

import { formatShekels, moneyLocale } from "@domain/money";
import { Button } from "@ui/button";
import { ChoiceGroup } from "@ui/choice-group";
import { MenuEditRow, MenuItemList, MenuItemRow } from "@ui/menu-item-row";
import { DraftLineRow, SendOrderButton } from "@ui/order-draft";
import { PlaceTile } from "@ui/place-tile";
import { Sheet } from "@ui/sheet";
import { StationBanner } from "@ui/station-banner";
import { Stepper } from "@ui/stepper";
import { OrderLine, TicketCard } from "@ui/ticket-card";
import { TillList } from "@ui/till-list";
import { useStationSound } from "@ui/use-station-sound";
import { Volume2, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import {
  LostOrdersNoticeView,
  OutboxBannerView,
} from "../(app)/orders/outbox-notice";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Where the tiles lead: the twin's floor, as the evening is. */
const FLOOR = "/design/order-taking/floor?state=service";

/**
 * Waiter mode's parts (S0, #191): a place on the floor in each of its
 * states, a ticket on a prep screen with its lines (choices, a note, an
 * allergy, one taken back) and a held block, what to ring up at the till,
 * the items an order adds with one tap, and the menu's rows to edit (P2):
 * one switched sold out, one that reaches no department, and two read only.
 * P4 adds the draft's line with its note, allergy and hold (and the mark of
 * a send that refused it), the send, "מוכן" while the server hears it, and
 * an item that can't be added while viewing. P5 adds a line cancelled with
 * its reason, one on the house (`OrderLine mark`) and its row at the till
 * with the price struck (`TillRow free`). P6 adds the choices: a group of
 * one as radios and extras at their most (`ChoiceGroup`), in the sheet whose
 * footer keeps "הוספה" in sight (`Sheet footer`), the draft's "בחירות" and
 * "לבחור שוב", and an item that opens its choices (`MenuItemRow opens`).
 * P7 adds a place with a round that hasn't gone (`PlaceTile` tone
 * `unsent`), and what the app says outside the mode: the banner above
 * another screen while an order waits, and the notice of one taken off the
 * phone. P8a adds the kitchen's screen: the banner with no connection and
 * the one that is a button once the sound stops (`StationBanner`), a ticket
 * that just arrived (`TicketCard fresh`) and one with every line cancelled
 * (`gone`), and the three sounds (`useStationSound`) after the tap that
 * turns them on. The words are the twin's and the app's; the dishes and
 * people only stand in.
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
  // The burger's choices: a doneness picked, both extras on, so the group
  // is at its most; the sheet adds two.
  const [doneness, setDoneness] = useState("medium");
  const [extras, setExtras] = useState(["egg", "cheese"]);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [burgers, setBurgers] = useState("2");
  const qtyId = useId();
  const sound = useStationSound();
  const st = useTranslations("app.orders.station");
  const extrasFull = extras.length >= 2;
  const donenessGroup = (
    <ChoiceGroup
      name={t("doneness")}
      rule={a("choice.rule.one")}
      kind="one"
      options={[
        { id: "rare", name: t("rare") },
        { id: "medium", name: t("medium") },
        { id: "wellDone", name: t("wellDone") },
      ]}
      picked={[doneness]}
      onPick={(id) => setDoneness(id)}
    />
  );
  const extrasGroup = (
    <ChoiceGroup
      name={t("extras")}
      rule={a("choice.rule.upTo", { max: 2 })}
      kind="many"
      options={[
        {
          id: "egg",
          name: t("egg"),
          hint: a.rich("choice.extra", {
            price: formatShekels(600, locale),
            ltr,
          }),
        },
        {
          id: "cheese",
          name: t("cheese"),
          hint: a.rich("choice.extra", {
            price: formatShekels(600, locale),
            ltr,
          }),
        },
        { id: "onion", name: t("onion") },
      ]}
      picked={extras}
      full={extrasFull ? a("choice.full", { max: 2 }) : null}
      onPick={(id, on) =>
        setExtras((was) =>
          on ? [...was, id] : was.filter((option) => option !== id),
        )
      }
    />
  );

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
            {
              name: "12",
              tone: "unsent",
              state: o("floor.state.unsent"),
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

      <h3 className="font-semibold text-base">{t("outside")}</h3>
      <div className="flex flex-col gap-3">
        <OutboxBannerView
          placement="inline"
          places={[table("6")]}
          waiting={1}
          href={FLOOR}
        />
        <LostOrdersNoticeView
          placement="inline"
          notice={{ count: 1, places: [table("6")], why: "signedOut" }}
          onSeen={() => {}}
        />
      </div>

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
          <OrderLine
            title={a.rich("line.qtyName", { qty: 1, name: t("salad"), ltr })}
            takenBack={a("line.cancelledWhy", {
              reason: a("reasons.line.guest"),
            })}
          />
          <OrderLine
            title={a.rich("line.qtyName", {
              qty: 1,
              name: t("lemonade"),
              ltr,
            })}
            mark={a("line.comped", { reason: a("reasons.comp.make_good") })}
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
                  mark: null,
                  chooses: true,
                },
                // Its doneness left the menu meanwhile: it asks to choose again.
                {
                  key: "burgerStale",
                  name: t("burger"),
                  choices: [t("mediumWell")],
                  agorot: 6800,
                  quantity: 1,
                  allergy: null,
                  held: false,
                  mark: a("draft.choicesStale"),
                  chooses: true,
                },
                {
                  key: "hummus",
                  name: t("hummus"),
                  choices: [],
                  agorot: 3200,
                  quantity: hummus,
                  allergy: null,
                  held,
                  mark: null,
                  chooses: false,
                },
                // A send refused it: it sold out meanwhile.
                {
                  key: "fish",
                  name: t("fish"),
                  choices: [],
                  agorot: 8400,
                  quantity: 1,
                  allergy: null,
                  held: false,
                  mark: a("picker.soldOut"),
                  chooses: false,
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
                mark={row.mark}
                choicesButton={
                  row.chooses
                    ? {
                        label: a("draft.choices"),
                        forItem: a("draft.forItem", { name: row.name }),
                        onClick: () => setChoicesOpen(true),
                      }
                    : null
                }
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
            count={a("send.count", { count: hummus + 2 })}
            routes={a("send.route", { department: kitchen, count: hummus + 2 })}
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
          {
            key: "beer",
            qty: 1,
            name: t("beer"),
            price: price(2800),
            free: a("till.free"),
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
        {/* A choice to make: a tap opens its choices (P6). */}
        <MenuItemRow
          name={t("burger")}
          detail={price(6800)}
          hint={a("picker.needsChoice")}
          opens
          count={0}
          countLabel={o("picker.inDraft")}
          onPick={() => setChoicesOpen(true)}
        />
        <MenuItemRow
          name={t("fish")}
          detail={price(8400)}
          count={0}
          countLabel={o("picker.inDraft")}
          soldOut={o("picker.soldOut")}
          onPick={() => {}}
        />
        {/* Viewing: nothing is added, and the row says so by its grey. */}
        <MenuItemRow
          name={t("hummus")}
          detail={price(3200)}
          count={0}
          countLabel={o("picker.inDraft")}
          disabled
          onPick={() => {}}
        />
      </MenuItemList>

      <h3 className="font-semibold text-base">{t("choices")}</h3>
      <p className="text-ink-2 text-sm">{t("choicesText")}</p>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {donenessGroup}
        {extrasGroup}
      </div>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setChoicesOpen(true)}
      >
        {t("choicesOpen")}
      </Button>
      <Sheet
        open={choicesOpen}
        onOpenChange={setChoicesOpen}
        title={t("burger")}
        subtitle={price(6800 + extras.length * 600)}
        closeLabel={a("choice.close")}
        footer={
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <label htmlFor={qtyId} className="font-medium">
                {a("choice.qty")}
              </label>
              <Stepper
                id={qtyId}
                value={burgers}
                onValueChange={setBurgers}
                min={1}
                max={99}
                decreaseLabel={a("draft.less", { name: t("burger") })}
                increaseLabel={a("draft.more", { name: t("burger") })}
              />
            </div>
            <Button size="lg" onClick={() => setChoicesOpen(false)}>
              {a("choice.add", { count: Number(burgers) || 1 })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 px-2 pt-1 pb-2">
          {donenessGroup}
          {extrasGroup}
        </div>
      </Sheet>

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

      <h3 className="font-semibold text-base">{t("station")}</h3>
      <p className="text-ink-2 text-sm">{t("stationText")}</p>
      <div className="flex flex-col gap-3">
        <StationBanner tone="danger" icon={<WifiOff />} title={st("offline")} />
        <StationBanner
          tone="warning"
          icon={<Volume2 />}
          title={st("soundLocked")}
          body={st("soundLockedBody")}
          onClick={sound.unlock}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <TicketCard
          title={table("6")}
          label={o("ticket.label", { place: table("6"), department: kitchen })}
          from={o("ticket.from", { name: t("waiter"), department: kitchen })}
          age={{ text: o("age.ago", { count: 0 }), tone: "calm" }}
          large
          fresh
          ready={{ label: o("ticket.ready"), onClick: () => {} }}
        >
          <OrderLine
            large
            title={o.rich("line.qtyName", { qty: 2, name: t("hummus"), ltr })}
          />
        </TicketCard>
        <TicketCard
          title={table("9")}
          label={o("ticket.label", { place: table("9"), department: kitchen })}
          from={o("ticket.from", { name: t("waiter"), department: kitchen })}
          age={{ text: o("age.ago", { count: 7 }), tone: "calm" }}
          large
          gone={st("gone")}
          ready={{
            label: st("dismiss"),
            ariaLabel: st("dismissLabel", { place: table("9") }),
            onClick: () => {},
          }}
        >
          <OrderLine
            large
            title={o.rich("line.qtyName", { qty: 1, name: t("salad"), ltr })}
            takenBack={a("line.cancelled")}
          />
        </TicketCard>
      </div>
      <div className="flex flex-col gap-3">
        <p role="status" className="text-ink-2 text-sm">
          {t(`sound.${sound.state}`)}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={sound.unlock}>
            <Volume2 aria-hidden="true" />
            {t("sound.unlock")}
          </Button>
          <Button
            variant="secondary"
            disabled={sound.state !== "on"}
            onClick={sound.chime}
          >
            {t("sound.chime")}
          </Button>
          <Button
            variant="secondary"
            disabled={sound.state !== "on"}
            onClick={sound.reminder}
          >
            {t("sound.reminder")}
          </Button>
          <Button
            variant="secondary"
            disabled={sound.state !== "on"}
            onClick={sound.doubleChime}
          >
            {t("sound.double")}
          </Button>
        </div>
      </div>
    </div>
  );
}
