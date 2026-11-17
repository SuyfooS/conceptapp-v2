"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useWakeLock } from "@ui/use-wake-lock";
import { ChefHat, Undo2, Volume2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { changeTicket, markSeen } from "../../changes";
import { orderDemoBusiness } from "../../data";
import { useOpenedWith, useOrderDemo } from "../../demo-store";
import type { Ticket } from "../../model";
import {
  departmentName,
  ltr,
  placeById,
  placeTitle,
  prepStatus,
  recentlyReady,
  StationFoot,
  TicketView,
  toMake,
  useOrderWords,
  useUndoToast,
} from "../../parts";

/** One short chime: a new ticket, or the sound working when it opens. */
function chime(audio: AudioContext | null) {
  if (audio?.state !== "running") return;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  const at = audio.currentTime;
  tone.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
  tone.connect(gain).connect(audio.destination);
  tone.start(at);
  tone.stop(at + 0.5);
}

/**
 * The kitchen's tablet, locked as its screen (§4.1, §4.4 to §4.8), holding
 * nobody's account. It opens on one large "פתיחת המטבח", the tap a browser
 * needs before it plays a sound; from then each new ticket chimes once and
 * the screen stays on. A ticket's "מוכן" is at least 64px tall, and the
 * place and lines read from about 1.5 m. A landscape tablet holds two or
 * three columns, a desktop four, a phone one. `?state=open` opens it as if
 * tapped, with the sound still to turn on; `?state=offline` shows what it
 * says when the connection is gone.
 */
export function KitchenStation() {
  const opened = useOpenedWith();
  const { t, time } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const [open, setOpen] = useState(
    opened === "open" || opened === "offline" || opened === "nothingOpen",
  );
  // Read once, as the screen is first drawn: the state then comes off the
  // address, and the screen stays offline until it opens afresh.
  const [offline] = useState(opened === "offline");
  const [sound, setSound] = useState(false);
  const [news, setNews] = useState("");
  useWakeLock(open);
  const department = "kitchen";
  const tickets = toMake(data, department);
  const recent = recentlyReady(data, department, now);
  const unseen = tickets
    .filter(({ ticket }) => !ticket.seen && !ticket.held)
    .map(({ ticket }) => ticket.id)
    .join(" ");

  // On the screen now: one chime for what is new, and the sender reads
  // "על המסך". Offline, nothing new reaches it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: what arrived is what this hears; the rest is read as it is then
  useEffect(() => {
    if (!open || offline || !unseen) return;
    chime(audio.current);
    const arrived = unseen.split(" ");
    setNews(
      tickets
        .filter(({ ticket }) => arrived.includes(ticket.id))
        .map(({ order }) => {
          const place = placeById(data, order.placeId);
          return t("station.newOrder", {
            place: place ? placeTitle(t, place) : "",
          });
        })
        .join(". "),
    );
    update((d) => markSeen(d, arrived));
  }, [open, offline, unseen, update]);

  // Hidden (Next keeps the page for going back) or gone, the sound stops
  // with it. Shown again, the screen says the sound is off and offers its
  // button, rather than saying it is on with nothing to play it.
  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
      setSound(false);
    },
    [],
  );

  /** The tap the browser needs before a sound: it chimes once to say it works. */
  function startSound() {
    try {
      audio.current ??= new AudioContext();
      void audio.current
        .resume()
        .then(() => {
          setSound(true);
          chime(audio.current);
        })
        .catch(() => setSound(false));
    } catch {
      setSound(false);
    }
  }

  function ready(ticket: Ticket, place: string) {
    update((d) =>
      changeTicket(d, ticket.id, {
        state: "ready",
        readyAt: now,
        readyBy: null,
      }),
    );
    say(
      t("toast.ready", {
        place,
        department: departmentName(ticket.department),
      }),
      () => update((d) => changeTicket(d, ticket.id, { state: "new" })),
      { focus: true, after: () => heading.current },
    );
  }

  if (!open) {
    return (
      <PageBody className={`${pageGlowClass} min-h-dvh justify-center`}>
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
          <span
            aria-hidden="true"
            className="grid size-20 place-items-center rounded-[26px] bg-surface text-accent shadow-card [&_svg]:size-9 [&_svg]:stroke-[1.6]"
          >
            <ChefHat />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-base text-ink-2">
              {t("station.kitchenEyebrow", { business: orderDemoBusiness })}
            </p>
            <h1 className="font-bold text-2xl">{departmentName(department)}</h1>
            <p className="text-ink-2">{prepStatus(t, data, department, now)}</p>
          </div>
          <Button
            size="lg"
            className="min-h-16 w-full text-lg"
            onClick={() => {
              startSound();
              setOpen(true);
            }}
          >
            <Volume2 aria-hidden="true" />
            {t("station.openKitchen")}
          </Button>
          <p className="text-pretty text-ink-2 text-sm">
            {t("station.openHint")}
          </p>
        </div>
      </PageBody>
    );
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        eyebrow={t("station.kitchenEyebrow", { business: orderDemoBusiness })}
        title={departmentName(department)}
        headingRef={heading}
        // With nothing to make, the empty state below says so, once.
        subtitle={
          tickets.length > 0 ? prepStatus(t, data, department, now) : undefined
        }
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        {offline ? (
          <Badge tone="danger">{t("station.offlineBadge")}</Badge>
        ) : (
          <Badge tone="success">{t("station.online")}</Badge>
        )}
        {sound ? <Badge>{t("station.soundOn")}</Badge> : null}
      </div>
      {offline ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card bg-danger px-5 py-4 font-semibold text-danger-ink text-lg"
        >
          <WifiOff aria-hidden="true" className="mt-1 size-6 shrink-0" />
          {t("station.offline")}
        </div>
      ) : null}
      {!sound ? (
        <Button
          variant="secondary"
          size="lg"
          className="self-start"
          onClick={startSound}
        >
          <Volume2 aria-hidden="true" />
          {t("station.soundLocked")}
        </Button>
      ) : null}
      {tickets.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ChefHat />}
          title={t("station.empty.title")}
          body={t("station.empty.body")}
        />
      ) : (
        <ul
          aria-label={t("prep.listLabel", {
            department: departmentName(department),
          })}
          className="grid gap-4 md:grid-cols-2 md:items-start lg:grid-cols-3 xl:grid-cols-4"
        >
          {tickets.map(({ order, round, ticket }) => {
            const place = placeById(data, order.placeId);
            const name = place ? placeTitle(t, place) : "";
            return (
              <li key={ticket.id}>
                <TicketView
                  t={t}
                  ticket={ticket}
                  round={round}
                  place={name}
                  now={now}
                  large
                  onReady={() => ready(ticket, name)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 ? (
        <PageSection title={t("prep.recent")}>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recent.map(({ order, ticket }) => {
              const place = placeById(data, order.placeId);
              const name = place ? placeTitle(t, place) : "";
              return (
                <li key={ticket.id}>
                  <Card className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-lg">{name}</span>
                      <span className="text-ink-2 text-sm">
                        {t.rich("station.readyAt", {
                          time: time(ticket.readyAt ?? now),
                          ltr,
                        })}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => {
                        update((d) =>
                          changeTicket(d, ticket.id, { state: "new" }),
                        );
                        say(t("toast.putBack", { place: name }));
                        heading.current?.focus({ preventScroll: true });
                      }}
                    >
                      <Undo2 aria-hidden="true" />
                      {t("prep.putBack")}
                      <span className="sr-only">
                        {t("draft.forItem", { name })}
                      </span>
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}
      <p role="status" className="sr-only">
        {news}
      </p>
      <StationFoot />
      {toast}
    </PageBody>
  );
}
