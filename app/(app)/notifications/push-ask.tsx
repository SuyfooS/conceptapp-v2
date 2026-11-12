"use client";

import { isPhone, pushSupport } from "@domain/push";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { browserFacts, ourWorker, turnOnPush } from "./push-client";

/**
 * Who may be offered notifications on the phone after giving away a shift or
 * sending availability (`currentPushAsk`): someone in a business whose lines
 * reach a phone, with push set up, never offered before. `seen` keeps that
 * they were (`seePushAskAction`), so it comes once, on any of their devices.
 */
export type PushAskOffer = {
  /** VAPID_PUBLIC_KEY, from the server. */
  publicKey: string;
  seen: () => Promise<void>;
};

/** What the moment was: a shift given away, or availability sent. */
export type PushAskMoment = "swap" | "availability";

type State =
  | "checking"
  /** Nothing to offer here: no push, blocked, or already on. */
  | "none"
  | "off"
  /** An iPhone in Safari: the app goes on the home screen first. */
  | "install"
  | "working"
  | "on"
  | "denied"
  | "failed";

const SETTINGS = "/notifications/settings";

/** What the keyboard can reach, as a browser counts it. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where the keyboard goes on once the card is put away: the first control
 * drawn after it, where the screen continues, or the last one before it.
 */
function focusAfter(card: HTMLElement): HTMLElement | null {
  const drawn = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter(
    (element) =>
      !card.contains(element) &&
      !element.closest("[inert]") &&
      element.getClientRects().length > 0,
  );
  const after = drawn.find(
    (element) =>
      card.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  return after ?? drawn.at(-1) ?? null;
}

/**
 * The offer as a screen keeps it: nothing until `offer()` at the moment (a
 * shift given away, availability sent), then held even after the screen's
 * refresh says it was made, so the card doesn't go with it. Once.
 */
export function usePushAskOnce(ask: PushAskOffer | null) {
  const [asking, setAsking] = useState<PushAskOffer | null>(null);
  const asked = useRef(false);
  const offer = useCallback(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    setAsking(ask);
  }, [ask]);
  const close = useCallback(() => setAsking(null), []);
  return { asking, offer, close };
}

/**
 * One quiet card, right after the person gave away a shift or sent their
 * availability: would they like to know what happens next on their phone?
 * Rendered from the start with `offer` null, so the words it says are read
 * out from a place already there; `offer` set, the card comes. Only where
 * this browser can take notifications and doesn't have them on: blocked,
 * unsupported or already on, it shows nothing and isn't counted as asked.
 * Shown, it is brought into view, clear of the floating bars, and kept as
 * asked (`offer.seen`) once it has really been on screen or one of its
 * buttons was pressed, so it never comes again. The press turns
 * notifications on there and then, asking for permission first, as the push
 * switch does; an iPhone in Safari is sent to the settings, which say how to
 * add the app to the home screen. "לא עכשיו" puts it away (`onClose`), and
 * the keyboard goes on to what follows it. No sound, no motion of its own:
 * the words change in place and are read out.
 */
export function PushAsk({
  offer,
  moment,
  onClose,
  className,
}: {
  offer: PushAskOffer | null;
  moment: PushAskMoment;
  onClose: () => void;
  className?: string;
}) {
  const [said, setSaid] = useState("");
  const close = useCallback(() => {
    setSaid("");
    onClose();
  }, [onClose]);
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
      {offer ? (
        <AskCard
          offer={offer}
          moment={moment}
          onSay={setSaid}
          onClose={close}
          className={className}
        />
      ) : null}
    </>
  );
}

function AskCard({
  offer,
  moment,
  onSay,
  onClose,
  className,
}: {
  offer: PushAskOffer;
  moment: PushAskMoment;
  /** Read out through the live region that was there before the card. */
  onSay: (words: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations("app.notifications");
  const locale = useLocale();
  const titleId = useId();
  const [state, setState] = useState<State>("checking");
  const [device, setDevice] = useState<"phone" | "other">("other");
  const worker = useRef<ServiceWorkerRegistration | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const noted = useRef(false);
  const brought = useRef(false);
  const lastSaid = useRef("");
  // The press that turned notifications on held the keyboard in the card.
  const refocus = useRef(false);
  const { seen } = offer;

  const fallbackTitle = t("push.notice.fallback.title");
  const fallbackBody = t("push.notice.fallback.body");

  useEffect(() => {
    let live = true;
    const facts = browserFacts();
    setDevice(isPhone(facts) ? "phone" : "other");
    const support = pushSupport(facts);
    if (support === "installFirst") {
      setState("install");
      return;
    }
    if (support !== "ready" || Notification.permission === "denied") {
      setState("none");
      return;
    }
    (async () => {
      try {
        // Only a worker turned on here before: none is registered for asking.
        const registration = await ourWorker();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (!live) return;
        worker.current = registration;
        setState(subscription ? "none" : "off");
      } catch {
        if (live) setState("none");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Kept as asked, once: seen, or answered.
  const note = useCallback(() => {
    if (noted.current) return;
    noted.current = true;
    seen().catch(() => {});
  }, [seen]);

  const shown = state !== "checking" && state !== "none";

  // Brought into view where it appears, once, under the floating title and
  // above the tab bar and anything floating over the screen (its scroll
  // margins); at once when the device asks for less motion.
  useEffect(() => {
    const element = card.current;
    if (!shown || brought.current || !element) return;
    brought.current = true;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [shown]);

  // Counted as asked once at least half of it has been on screen: never
  // while it waits out of sight, on a screen kept hidden, or under a sheet.
  useEffect(() => {
    const element = card.current;
    if (!shown || noted.current || !element) return;
    if (typeof IntersectionObserver === "undefined") {
      note();
      return;
    }
    const watching = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio >= 0.5)) {
          note();
          watching.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    watching.observe(element);
    return () => watching.disconnect();
  }, [shown, note]);

  const title = t(`ask.${moment}`);
  const body =
    state === "install"
      ? t("ask.install")
      : state === "on"
        ? t("ask.on", { device })
        : state === "denied"
          ? t("push.denied", { device })
          : state === "failed"
            ? t("push.failed")
            : t("ask.body", { device });

  // Read out as it comes, with its question, then each change of its words.
  useEffect(() => {
    if (!shown || state === "working" || body === lastSaid.current) return;
    const first = lastSaid.current === "";
    lastSaid.current = body;
    onSay(first ? `${title} ${body}` : body);
  }, [shown, state, title, body, onSay]);

  // A press whose button went (on, blocked) or was busy keeps the keyboard
  // in the card, on what is there now.
  useEffect(() => {
    if (state === "working" || !refocus.current) return;
    refocus.current = false;
    const element = card.current;
    if (!element || element.contains(document.activeElement)) return;
    actions.current
      ?.querySelector<HTMLElement>(FOCUSABLE)
      ?.focus({ preventScroll: true });
  }, [state]);

  async function turnOn() {
    if (state === "working") return;
    note();
    refocus.current = Boolean(card.current?.contains(document.activeElement));
    setState("working");
    const { answer, registration } = await turnOnPush(
      worker.current,
      offer.publicKey,
      {
        title: fallbackTitle,
        body: fallbackBody,
        lang: locale,
        dir: locale === "he" ? "rtl" : "ltr",
      },
    );
    worker.current = registration;
    setState(
      answer === "on" || answer === "denied" || answer === "off"
        ? answer
        : "failed",
    );
  }

  function close() {
    note();
    const element = card.current;
    const next =
      element?.contains(document.activeElement) === true
        ? focusAfter(element)
        : null;
    onClose();
    next?.focus({ preventScroll: true });
  }

  if (!shown) return null;

  const canTurnOn =
    state === "off" || state === "working" || state === "failed";
  const finished = state === "on" || state === "denied";

  return (
    <Card
      ref={card}
      tone="flat"
      padding="lg"
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "flex scroll-mt-[calc(env(safe-area-inset-top)+5rem)] scroll-mb-[calc(env(safe-area-inset-bottom)+6.5rem)] flex-col gap-4 xl:scroll-mt-8 xl:scroll-mb-8",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
        >
          <BellRing />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="font-semibold text-md text-pretty">
            {title}
          </h2>
          <p className="text-base text-ink-2">{body}</p>
        </div>
      </div>
      <div ref={actions} className="flex flex-wrap items-center gap-2">
        {canTurnOn ? (
          <Button
            variant="secondary"
            loading={state === "working"}
            onClick={turnOn}
          >
            {t("ask.enable", { device })}
          </Button>
        ) : null}
        {state === "install" || state === "on" ? (
          <Button asChild variant="secondary">
            <Link href={SETTINGS} onClick={note}>
              {t("ask.settings")}
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" className="text-ink-2" onClick={close}>
          {finished ? t("ask.close") : t("ask.dismiss")}
        </Button>
      </div>
    </Card>
  );
}
