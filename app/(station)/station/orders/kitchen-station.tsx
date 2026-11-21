"use client";

import { minutesSince } from "@domain/order-screens";
import {
  freshTickets,
  lateNews,
  type StationMenuItem,
  stationNews,
  stationSince,
} from "@domain/order-stations";
import type { PrepTicket } from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { SkeletonBones } from "@ui/skeleton";
import { StationBanner } from "@ui/station-banner";
import { type StationSound, useStationSound } from "@ui/use-station-sound";
import { useWakeLock } from "@ui/use-wake-lock";
import { ChefHat, CircleSlash, Volume2, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OrderFactsContext } from "@/app/(app)/orders/order-facts";
import { useModeToast } from "@/app/(app)/orders/orders-mode";
import { useOrderWords } from "@/app/(app)/orders/orders-parts";
import {
  RecentlyReady,
  recentlyReady,
  TicketGrid,
  toMake,
} from "@/app/(app)/orders/prep-parts";
import { SoldOutSheet } from "./sold-out-sheet";
import type { StationBackend } from "./station-backend";
import { stationFailureWords } from "./station-words";
import { type StationPoll, useStationPoll } from "./use-station-poll";

/** What a station shows besides its orders. Never anyone's account. */
export type StationFacts = {
  businessName: string;
  timeZone: string;
  /** The station's own name, as whoever locked it named it. */
  name: string;
  /** A kitchen's screen's department, by its name; null for every one. */
  department: { id: string; name: string } | null;
};

/**
 * The kitchen's tablet, locked as its screen (waiter mode P8a; the design's
 * §4.1, §4.4 to §4.8), holding nobody's account. It opens on one large
 * button (default 4), the tap a browser needs before it plays a sound, and
 * reads nothing until it is pressed, after every reload too, so no ticket is
 * marked "על המסך" on a screen that can't chime; the press also asks for
 * full screen where the device has it. From then: one chime for each new
 * ticket or block called, which flashes in the business's colour (an edge
 * for half a minute with reduced motion), one reminder for a ticket waiting
 * past the business's time, the double chime for a line taken back or
 * cancelled, struck and kept; the screen stays awake. "מוכן" bumps a ticket
 * to "מוכנים לאחרונה" with "ביטול"; "מה נגמר" marks items sold out. With no
 * connection for two asks in a row, a banner across the top; with the sound
 * stopped by the device, a banner that is its button. Phone: one column;
 * tablet: two, three on a landscape one; desktop: four.
 */
export function KitchenStation({
  facts,
  backend,
  foot,
  leave,
  opened = false,
  soundLocked = false,
  soldOutOpen = false,
}: {
  facts: StationFacts;
  backend: StationBackend;
  /** Under the screen: the way to an account (the twin's way back). */
  foot: ReactNode;
  /** Told to leave (stopped, no station, someone signed in): the page read again. */
  leave: () => void;
  /** Past the gate at once: the twin's states. */
  opened?: boolean;
  /** The twin's: the sound said to be stopped. */
  soundLocked?: boolean;
  /** The twin's: "מה נגמר" open at once. */
  soldOutOpen?: boolean;
}) {
  const [open, setOpen] = useState(opened);
  const poll = useStationPoll(backend, { enabled: open, leave });
  const sound = useStationSound();
  const prep = poll.prep;
  const departments = Object.fromEntries(
    (prep?.departments ?? []).map((d) => [d.id, d.name]),
  );
  if (facts.department)
    departments[facts.department.id] ??= facts.department.name;
  return (
    <OrderFactsContext.Provider
      value={{
        timeZone: facts.timeZone,
        departments,
        names: poll.names,
        lateAfterMinutes: prep?.lateAfterMinutes ?? 15,
        now: poll.now,
      }}
    >
      {open ? (
        <KitchenScreen
          facts={facts}
          backend={backend}
          poll={poll}
          sound={soundLocked ? { ...sound, state: "locked" } : sound}
          foot={foot}
          soldOutOpen={soldOutOpen}
        />
      ) : (
        <KitchenGate
          facts={facts}
          onOpen={() => {
            sound.unlock();
            // Where the device has it; refused, nothing changes.
            void document.documentElement
              .requestFullscreen?.()
              ?.catch(() => undefined);
            setOpen(true);
          }}
          foot={foot}
        />
      )}
    </OrderFactsContext.Provider>
  );
}

/** "פתיחת המטבח": the screen's name and department, and the one large button. */
function KitchenGate({
  facts,
  onOpen,
  foot,
}: {
  facts: StationFacts;
  onOpen: () => void;
  foot: ReactNode;
}) {
  const t = useTranslations("app.orders.station");
  return (
    <PageBody className={cn(pageGlowClass, "min-h-dvh justify-center")}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
        <span
          aria-hidden="true"
          className="grid size-20 place-items-center rounded-[26px] bg-surface text-accent shadow-card [&_svg]:size-9 [&_svg]:stroke-[1.6]"
        >
          <ChefHat />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base text-ink-2">{facts.businessName}</p>
          <h1 className="text-balance font-bold text-2xl">
            {facts.department?.name ?? t("allDepartments")}
          </h1>
          <p className="text-ink-2">{t("name", { name: facts.name })}</p>
        </div>
        <Button size="lg" className="min-h-16 w-full text-lg" onClick={onOpen}>
          <Volume2 aria-hidden="true" />
          {t("open")}
        </Button>
        <p className="text-pretty text-ink-2 text-sm">{t("openHint")}</p>
      </div>
      <div className="mt-auto flex justify-center pt-2">{foot}</div>
    </PageBody>
  );
}

function KitchenScreen({
  facts,
  backend,
  poll,
  sound,
  foot,
  soldOutOpen,
}: {
  facts: StationFacts;
  backend: StationBackend;
  poll: StationPoll;
  sound: StationSound;
  foot: ReactNode;
  soldOutOpen: boolean;
}) {
  const { t, placeTitle, department } = useOrderWords();
  const ts = useTranslations("app.orders.station");
  const tPage = useTranslations("station");
  const { say, toast } = useModeToast();
  const awake = useWakeLock(true);
  const title = useRef<HTMLHeadingElement>(null);
  const prep = poll.prep;
  const now = poll.now;
  // Marked here: shown at once, until the next read.
  const [marked, setMarked] = useState<{
    version: number;
    ready: string[];
    back: string[];
  }>({ version: prep?.version ?? 0, ready: [], back: [] });
  if (prep && prep.version !== marked.version) {
    setMarked({ version: prep.version, ready: [], back: [] });
  }
  const [busy, setBusy] = useState<string | null>(null);
  /** Struck whole and taken off this screen by hand. */
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  /** When each ticket arrived, on the server's clock: fresh for a while. */
  const [arrived, setArrived] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const [news, setNews] = useState("");
  const [soldOut, setSoldOut] = useState(soldOutOpen);
  const before = useRef<readonly PrepTicket[] | null>(null);
  const reminded = useRef(new Set<string>());

  const tickets = (prep?.tickets ?? [])
    .filter((ticket) => !dismissed.includes(ticket.id))
    .map((ticket) =>
      marked.ready.includes(ticket.id)
        ? {
            ...ticket,
            status: "ready" as const,
            readyAt: new Date(now).toISOString(),
          }
        : marked.back.includes(ticket.id)
          ? { ...ticket, status: "new" as const }
          : ticket,
    );
  const shown = toMake(tickets, true);
  const open = shown.filter((ticket) => ticket.status === "new");
  const recent = recentlyReady(tickets, now);
  const oldest = open[0];
  const fresh = freshTickets(arrived, now);
  const placeOf = (id: string) => {
    const ticket = prep?.tickets.find((one) => one.id === id);
    return ticket ? placeTitle(ticket) : "";
  };

  // What a read brought: a chime for what arrived, the double chime for a
  // line struck, said to screen readers too. The first read after opening
  // tells nothing, and what waits too long already then is not reminded of.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new read is what tells; the rest is read as it is then
  useEffect(() => {
    if (!prep) return;
    const was = before.current;
    before.current = prep.tickets;
    if (was === null) {
      for (const id of lateNews(
        prep.tickets,
        now,
        prep.lateAfterMinutes,
        reminded.current,
      )) {
        reminded.current.add(id);
      }
      return;
    }
    const told = stationNews(was, prep.tickets);
    const said: string[] = [];
    if (told.arrived.length > 0) {
      sound.chime();
      setArrived((times) => {
        const next = new Map(times);
        for (const id of told.arrived) next.set(id, now);
        return next;
      });
      for (const id of told.arrived) {
        said.push(ts("news.new", { place: placeOf(id) }));
      }
    }
    if (told.struck.length > 0) {
      sound.doubleChime();
      for (const { ticket, line } of told.struck) {
        const name =
          prep.tickets
            .find((one) => one.id === ticket)
            ?.lines.find((one) => one.id === line)?.name ?? "";
        said.push(ts("news.cancelled", { name, place: placeOf(ticket) }));
      }
    }
    if (said.length > 0) setNews(said.join(". "));
  }, [prep]);

  // One reminder for each ticket that waits past the business's time, as the
  // clock crosses it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the clock and a new read are what remind
  useEffect(() => {
    if (!prep || before.current === null) return;
    const late = lateNews(
      prep.tickets,
      now,
      prep.lateAfterMinutes,
      reminded.current,
    );
    if (late.length === 0) return;
    for (const id of late) reminded.current.add(id);
    sound.reminder();
    setNews(
      late.map((id) => ts("news.late", { place: placeOf(id) })).join(". "),
    );
  }, [now, prep]);

  async function ready(ticket: PrepTicket, place: string) {
    setBusy(ticket.id);
    const result = await backend.write({
      do: "ready",
      ticket: ticket.id,
      ready: true,
    });
    setBusy(null);
    if (!result.ok) {
      say(stationFailureWords(t, ts("checking"), result.failure));
      return;
    }
    setMarked((was) => ({ ...was, ready: [...was.ready, ticket.id] }));
    poll.pollNow();
    say(
      t("toast.ready", { place, department: department(ticket.department) }),
      {
        undo: () => void putBack(ticket, place, false),
        focus: true,
        after: () => title.current,
      },
    );
  }

  async function putBack(ticket: PrepTicket, place: string, tell = true) {
    setMarked((was) => ({
      ...was,
      ready: was.ready.filter((id) => id !== ticket.id),
      back: [...was.back, ticket.id],
    }));
    const result = await backend.write({
      do: "ready",
      ticket: ticket.id,
      ready: false,
    });
    if (!result.ok) {
      setMarked((was) => ({
        ...was,
        back: was.back.filter((id) => id !== ticket.id),
      }));
      say(stationFailureWords(t, ts("checking"), result.failure));
      return;
    }
    poll.pollNow();
    if (tell) {
      say(t("toast.putBack", { place }));
      title.current?.focus({ preventScroll: true });
    }
  }

  async function markSoldOut(
    item: StationMenuItem,
    out: boolean,
  ): Promise<string | null> {
    const result = await backend.write({
      do: "available",
      item: item.id,
      available: !out,
    });
    if (!result.ok) {
      return stationFailureWords(t, ts("checking"), result.failure);
    }
    poll.pollNow();
    return null;
  }

  const heading = facts.department?.name ?? ts("allDepartments");
  const status = [
    poll.connection === "ok" ? ts("online") : ts("offlineShort"),
    ...(sound.state === "on" ? [ts("soundOn")] : []),
  ].join(" · ");
  const loading = prep === null && poll.refusal === null;

  return (
    <PageBody className={cn(pageGlowClass, "min-h-dvh")}>
      <PageHeader
        eyebrow={facts.businessName}
        title={heading}
        headingRef={title}
        subtitle={
          shown.length > 0
            ? oldest
              ? t("prep.status", {
                  count: open.length,
                  minutes: minutesSince(stationSince(oldest), now),
                })
              : t("prep.nothingOpen")
            : undefined
        }
        actions={
          <Button variant="secondary" onClick={() => setSoldOut(true)}>
            <CircleSlash aria-hidden="true" />
            {ts("soldOut.open")}
          </Button>
        }
      />
      {poll.connection === "down" ? (
        <StationBanner tone="danger" icon={<WifiOff />} title={ts("offline")} />
      ) : null}
      {sound.state === "locked" ? (
        <StationBanner
          tone="warning"
          icon={<Volume2 />}
          title={ts("soundLocked")}
          body={ts("soundLockedBody")}
          onClick={sound.unlock}
        />
      ) : null}
      <div className="-mt-2 flex flex-col gap-1">
        <p className="text-ink-2 text-sm">{status}</p>
        {awake === "off" ? (
          <p className="text-ink-2 text-sm">{ts("awakeOff")}</p>
        ) : null}
      </div>
      {poll.refusal === "off" ? (
        <Card>
          <p className="text-ink">{ts("off")}</p>
        </Card>
      ) : poll.refusal !== null ? (
        <Card>
          <p className="text-ink">{ts("checking")}</p>
        </Card>
      ) : null}
      {prep?.departmentGone ? (
        <Card>
          <p className="text-ink">{ts("departmentGone")}</p>
        </Card>
      ) : null}
      {loading ? (
        <div role="status">
          <span className="sr-only">{tPage("prep.loading")}</span>
          <SkeletonBones />
        </div>
      ) : poll.refusal !== null ? null : shown.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ChefHat />}
          title={ts("empty.title")}
          body={ts("empty.body")}
        />
      ) : (
        <TicketGrid
          tickets={shown}
          label={t("prep.listLabel", { department: heading })}
          layout="station"
          busy={busy}
          onReady={(ticket, place) => void ready(ticket, place)}
          fresh={fresh}
          onDismiss={(ticket) => setDismissed((ids) => [...ids, ticket.id])}
        />
      )}
      <RecentlyReady
        tickets={recent}
        layout="station"
        onPutBack={(ticket, place) => void putBack(ticket, place)}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {news}
      </p>
      <div className="mt-auto flex flex-col items-center gap-1 pt-2 md:flex-row md:justify-between">
        <p className="text-ink-2 text-sm">{ts("name", { name: facts.name })}</p>
        {foot}
      </div>
      <SoldOutSheet
        open={soldOut}
        onOpenChange={setSoldOut}
        title={
          facts.department
            ? ts("soldOut.title", { department: facts.department.name })
            : ts("soldOut.titleAll")
        }
        menu={poll.menu}
        setSoldOut={markSoldOut}
      />
      {toast}
    </PageBody>
  );
}
