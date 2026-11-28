"use client";

import { type PushAskMark, type PushAskState, pushAskMark } from "@domain/push";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { focusWhenGone } from "@ui/focus-after";
import { UndoRow } from "@ui/undo-row";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  type Dispatch,
  type Ref,
  type SetStateAction,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { headingsAfter } from "../home/heading-after";
import { useHeldWrite } from "../use-held-write";
import { IosInstallSteps } from "./ios-install-steps";
import type { PushAskOffer } from "./push-ask";
import { type PushAskShown, usePushAskState } from "./push-ask-state";
import { putInstallAway, turnOnPush } from "./push-client";

/**
 * What Today's card is given: the app's offer (`currentPushAsk`), or, on
 * the twin at /design/shell, the state to show, which asks the browser for
 * nothing and keeps nothing.
 */
export type TodayPushAsk = { offer: PushAskOffer } | { twin: PushAskState };

type Kept = Exclude<PushAskMark, null>;

/** How the card's state is had and changed: by the browser in the app, by hand on the twin. */
type Driver = {
  state: PushAskShown;
  setState: Dispatch<SetStateAction<PushAskShown>>;
  device: "phone" | "other";
  /** Turns notifications on, from inside the press: what came of it. */
  turnOn: () => Promise<PushAskState>;
  /** Keeps what "לא עכשיו" keeps; whether Today is to be drawn again for it. */
  keep: (mark: Kept) => Promise<boolean>;
};

/** The twin's stand-in for a press on its way. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 600));

/**
 * Today's card that offers notifications on the phone (closing the pilot,
 * PR 6), for everyone who has a Today: workers, managers, owners and the
 * accountant. It comes on every visit until this device has them or the
 * person says "לא עכשיו": where this browser can take them and doesn't have
 * them on, the press turns them on there and then, asking for permission
 * first, as the push switch does; in an iPhone's or iPad's Safari it shows
 * the steps to the home screen (`IosInstallSteps`), and the app there, once
 * installed, shows the switch. Blocked, unsupported or on already, it shows
 * nothing. Being seen keeps nothing. "לא עכשיו" puts it away the way Today's
 * other cards go: at once, with "ביטול" in its place holding the focus and
 * the write (`useHeldWrite`), which keeps it for the person, on every device
 * and for the moments' cards too (`putAwayPushAskAction`), or, for the
 * steps, in this browser only (`pushAskMark`). "ביטול" brings it back with
 * the focus on "לא עכשיו"; once the row goes, the focus goes on to the next
 * section's title. After a press that turned them on, or found them
 * blocked, "סגירה" closes it and keeps nothing: there is nothing left to
 * offer here. It is never brought into view and never says itself as it
 * comes, since Today is being read then; a change of its words after a
 * press is said.
 */
export function PushAskToday({
  ask,
  settingsHref,
  className,
}: {
  ask: TodayPushAsk;
  /** /notifications/settings, or the twin's. */
  settingsHref: string;
  className?: string;
}) {
  return "offer" in ask ? (
    <LiveToday
      offer={ask.offer}
      settingsHref={settingsHref}
      className={className}
    />
  ) : (
    <TwinToday
      twin={ask.twin}
      settingsHref={settingsHref}
      className={className}
    />
  );
}

function LiveToday({
  offer,
  settingsHref,
  className,
}: {
  offer: PushAskOffer;
  settingsHref: string;
  className?: string;
}) {
  const t = useTranslations("app.notifications.push.notice.fallback");
  const locale = useLocale();
  const { state, setState, device, worker } = usePushAskState(offer.devices);
  const driver: Driver = {
    state,
    setState,
    device,
    turnOn: async () => {
      const { answer, registration } = await turnOnPush(
        worker.current,
        offer.publicKey,
        {
          title: t("title"),
          body: t("body"),
          lang: locale,
          dir: locale === "he" ? "rtl" : "ltr",
        },
      );
      worker.current = registration;
      return answer === "on" || answer === "denied" || answer === "off"
        ? answer
        : "failed";
    },
    keep: async (mark) => {
      if (mark === "device") {
        putInstallAway();
        return false;
      }
      await offer.putAway();
      return true;
    },
  };
  return (
    <TodayCard
      driver={driver}
      settingsHref={settingsHref}
      className={className}
    />
  );
}

function TwinToday({
  twin,
  settingsHref,
  className,
}: {
  twin: PushAskState;
  settingsHref: string;
  className?: string;
}) {
  const [state, setState] = useState<PushAskShown>(twin);
  const driver: Driver = {
    state,
    setState,
    device: "phone",
    turnOn: async () => {
      await pause();
      return "on";
    },
    keep: async () => false,
  };
  return (
    <TodayCard
      driver={driver}
      settingsHref={settingsHref}
      className={className}
    />
  );
}

function TodayCard({
  driver,
  settingsHref,
  className,
}: {
  driver: Driver;
  settingsHref: string;
  className?: string;
}) {
  const t = useTranslations("app.notifications.ask");
  const router = useRouter();
  const { state, setState, device } = driver;
  const words = useTodayWords(state, device);
  const card = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);
  // Where the card was, still there once it went.
  const anchor = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState<Kept | "closed" | null>(null);
  // The press that turned notifications on held the keyboard in the card.
  const refocus = useRef(false);
  const backToButton = useRef(false);
  const closedWithFocus = useRef(false);
  const lastSaid = useRef<string | null>(null);
  // Today is on screen: not once it is left, while Next keeps it for the way
  // back, so a write sent on leaving never draws the next screen again.
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const held = useHeldWrite<Kept>(async (mark) => {
    const again = await driver.keep(mark).catch(() => false);
    if (again && shown.current) router.refresh();
  });

  // Its first words aren't said, since Today is being read as it comes;
  // each change after a press is.
  const body = words?.body ?? null;
  useEffect(() => {
    if (body === null || state === "working") return;
    if (lastSaid.current === null) {
      lastSaid.current = body;
      return;
    }
    if (body === lastSaid.current) return;
    lastSaid.current = body;
    announce(body);
  }, [body, state]);

  // A press whose button went (on, blocked) or was busy keeps the keyboard
  // in the card, on what is there now.
  useEffect(() => {
    if (state === "working" || !refocus.current) return;
    refocus.current = false;
    const element = card.current;
    if (!element || element.contains(document.activeElement)) return;
    actions.current
      ?.querySelector<HTMLElement>("a[href], button:not([disabled])")
      ?.focus({ preventScroll: true });
  }, [state]);

  // Back from "ביטול", the keyboard goes where it was; closed with it in the
  // card, on to the next section's title.
  useEffect(() => {
    if (gone === null && backToButton.current) {
      backToButton.current = false;
      dismissButton.current?.focus();
    }
    if (gone === "closed" && closedWithFocus.current) {
      closedWithFocus.current = false;
      focusWhenGone(headingsAfter(anchor.current));
    }
  }, [gone]);

  async function enable() {
    if (state === "working") return;
    refocus.current = Boolean(card.current?.contains(document.activeElement));
    setState("working");
    setState(await driver.turnOn());
  }

  function dismiss() {
    if (state === "checking" || state === "none") return;
    const mark = pushAskMark("today", state, "dismiss");
    if (mark) {
      setGone(mark);
      held.hold(mark);
      return;
    }
    closedWithFocus.current = Boolean(
      card.current?.contains(document.activeElement),
    );
    setGone("closed");
  }

  function undo() {
    held.release();
    backToButton.current = true;
    setGone(null);
  }

  if (state === "checking" || state === "none") return null;

  if (gone) {
    return (
      <>
        <span ref={anchor} hidden />
        {gone !== "closed" && held.held ? (
          <div className={cn("md:max-w-2xl", className)}>
            <UndoRow
              message={gone === "device" ? t("putAwayHere") : t("putAway")}
              onUndo={undo}
              autoFocus
              onWaitingChange={(waiting) =>
                waiting ? held.pause() : held.resume()
              }
              focusAfter={() => headingsAfter(anchor.current)}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <PushAskTodayCard
      state={state}
      device={device}
      settingsHref={settingsHref}
      onEnable={enable}
      onDismiss={dismiss}
      cardRef={card}
      actionsRef={actions}
      dismissRef={dismissButton}
      className={className}
    />
  );
}

/** What Today's card says in each state; none while it shows nothing. */
function useTodayWords(
  state: PushAskShown,
  device: "phone" | "other",
): { title: string; body: string } | null {
  const t = useTranslations("app.notifications");
  switch (state) {
    case "checking":
    case "none":
      return null;
    case "install":
      return { title: t("push.iosHint.title"), body: t("push.iosHint.body") };
    case "on":
      return {
        title: t("ask.today", { device }),
        body: t("ask.on", { device }),
      };
    case "denied":
      return {
        title: t("ask.today", { device }),
        body: t("push.denied", { device }),
      };
    case "failed":
      return { title: t("ask.today", { device }), body: t("push.failed") };
    default:
      return {
        title: t("ask.today", { device }),
        body: t("ask.body", { device }),
      };
  }
}

/**
 * Today's card in one state, as it draws: a quiet card (the screen's accent
 * stays with its own main action), the question and what it gets, the steps
 * to the home screen in Safari, and its buttons: phone, one under the other
 * across the card; from a tablet up, the words at the start and the buttons
 * at the end. Drawn by `PushAskToday`, and by the /design gallery in each
 * state, with nothing behind its buttons. `landmark` false leaves out its
 * region, for a page that draws several with the same name.
 */
export function PushAskTodayCard({
  state,
  device,
  settingsHref,
  onEnable,
  onDismiss,
  landmark = true,
  cardRef,
  actionsRef,
  dismissRef,
  className,
}: {
  state: PushAskState;
  device: "phone" | "other";
  settingsHref: string;
  onEnable?: () => void;
  onDismiss?: () => void;
  landmark?: boolean;
  cardRef?: Ref<HTMLDivElement>;
  actionsRef?: Ref<HTMLDivElement>;
  dismissRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  const t = useTranslations("app.notifications.ask");
  const titleId = useId();
  const words = useTodayWords(state, device);
  const canTurnOn =
    state === "off" || state === "working" || state === "failed";
  const finished = state === "on" || state === "denied";

  return (
    <Card
      ref={cardRef}
      tone="flat"
      padding="lg"
      role={landmark ? "region" : undefined}
      aria-labelledby={landmark ? titleId : undefined}
      className={cn(
        "flex flex-col gap-4 md:max-w-2xl md:flex-row md:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
        >
          <BellRing />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle as="h2" id={titleId} className="text-pretty">
            {words?.title}
          </CardTitle>
          <CardText className="text-pretty">{words?.body}</CardText>
          {state === "install" ? <IosInstallSteps className="mt-2" /> : null}
        </div>
      </div>
      <div
        ref={actionsRef}
        className="flex flex-col gap-2 md:shrink-0 md:flex-row"
      >
        {canTurnOn ? (
          <Button
            variant="secondary"
            loading={state === "working"}
            onClick={onEnable}
            className="w-full md:w-auto"
          >
            {t("enable", { device })}
          </Button>
        ) : null}
        {state === "on" ? (
          <Button asChild variant="secondary" className="w-full md:w-auto">
            <Link href={settingsHref}>{t("settings")}</Link>
          </Button>
        ) : null}
        <Button
          ref={dismissRef}
          variant="ghost"
          onClick={onDismiss}
          className="w-full text-ink-2 md:w-auto"
        >
          {finished ? t("close") : t("dismiss")}
        </Button>
      </div>
    </Card>
  );
}
