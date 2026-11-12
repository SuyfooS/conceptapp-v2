"use client";

import { isPhone, type PushSupport, pushSupport } from "@domain/push";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Spinner } from "@ui/spinner";
import { Switch } from "@ui/switch";
import { BellRing, Send, Share, SquarePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import {
  browserFacts,
  forgetSubscription,
  leaveFallback,
  ourWorker,
  turnOnPush,
} from "./push-client";

/** Where this browser's notifications stand. */
type State = Exclude<PushSupport, "ready"> | "denied" | "off" | "on" | "demo";

type Test = "sending" | "sent" | "tooSoon" | "failed" | null;

/**
 * Notifications on this phone (or tablet, or computer): a switch in a row,
 * and once it is on, a row that sends a test. Nothing is asked for and no
 * worker is registered until the person presses the switch. The first press
 * asks for permission before anything else waits, while Safari still counts
 * the press, then registers the worker and subscribes; once the worker is
 * there, a press subscribes at once. An iPhone in Safari is told to add the app to the
 * home screen first; a browser that blocked notifications says so; a demo
 * business says its notifications stay in the app, whatever the browser. Out
 * of a demo, a browser with no push shows nothing. The words say phone or device by what the browser is, never
 * by the width, so every shape says the same. `quietWhenOn`: once on, shown
 * from the tablet up only (the phone's inbox keeps to its lines).
 */
export function PushSwitch({
  publicKey,
  demo,
  quietWhenOn = false,
  className,
}: {
  /** VAPID_PUBLIC_KEY, from the server. */
  publicKey: string;
  /** A demo business, or one whose lines reach no phone. */
  demo: boolean;
  quietWhenOn?: boolean;
  className?: string;
}) {
  const t = useTranslations("app.notifications.push");
  const locale = useLocale();
  const titleId = useId();
  const [state, setState] = useState<State | null>(null);
  const [device, setDevice] = useState<"phone" | "other">("other");
  const [working, setWorking] = useState(false);
  /** Which press didn't go through, for the line that says so. */
  const [failed, setFailed] = useState<"on" | "off" | null>(null);
  const [test, setTest] = useState<Test>(null);
  const worker = useRef<ServiceWorkerRegistration | null>(null);

  // The line the worker shows when the app can't be reached, in our words.
  const fallbackTitle = t("notice.fallback.title");
  const fallbackBody = t("notice.fallback.body");
  const dir = locale === "he" ? "rtl" : "ltr";

  useEffect(() => {
    let live = true;
    const facts = browserFacts();
    setDevice(isPhone(facts) ? "phone" : "other");
    // A demo says its notifications stay in the app on every browser, before
    // any word about installing it or updating the phone, which would get it
    // nothing.
    if (demo) {
      setState("demo");
      return;
    }
    const support = pushSupport(facts);
    if (support !== "ready") {
      setState(support);
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    (async () => {
      try {
        // Only a worker turned on here before: none is registered for asking.
        const registration = await ourWorker();
        if (!live) return;
        if (!registration) {
          setState("off");
          return;
        }
        worker.current = registration;
        leaveFallback(registration, {
          title: fallbackTitle,
          body: fallbackBody,
          lang: locale,
          dir,
        });
        const subscription = await registration.pushManager.getSubscription();
        if (live) setState(subscription ? "on" : "off");
      } catch {
        if (live) setState("unsupported");
      }
    })();
    return () => {
      live = false;
    };
  }, [demo, fallbackTitle, fallbackBody, locale, dir]);

  async function turnOn() {
    if (working) return;
    setWorking(true);
    setFailed(null);
    // Turned on here before: it subscribes at once, inside the press; else
    // the browser asks for permission first, which Safari allows only now.
    const { answer, registration } = await turnOnPush(
      worker.current,
      publicKey,
      { title: fallbackTitle, body: fallbackBody, lang: locale, dir },
    );
    worker.current = registration;
    setWorking(false);
    if (answer === "failed") setFailed("on");
    else setState(answer);
  }

  async function turnOff() {
    const registration = worker.current;
    if (!registration || working) return;
    setWorking(true);
    setFailed(null);
    setTest(null);
    const subscription = await registration.pushManager
      .getSubscription()
      .catch(() => null);
    const forgotten = subscription
      ? await forgetSubscription(subscription)
      : true;
    if (forgotten) await subscription?.unsubscribe().catch(() => false);
    setWorking(false);
    if (forgotten) setState("off");
    else setFailed("off");
  }

  async function sendTest() {
    if (test === "sending") return;
    setTest("sending");
    try {
      const response = await fetch("/push/test", {
        method: "POST",
        credentials: "same-origin",
      });
      setTest(
        response.ok ? "sent" : response.status === 429 ? "tooSoon" : "failed",
      );
    } catch {
      setTest("failed");
    }
  }

  if (state === null || state === "unsupported") return null;

  const title = t("title", { device });
  const hidden = quietWhenOn && state === "on" ? "hidden md:flex" : null;

  if (state === "installFirst") {
    return (
      <Card
        tone="flat"
        padding="lg"
        className={cn("flex flex-col gap-3", className)}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
          >
            <BellRing />
          </span>
          <CardTitle as="h2">{t("iosHint.title")}</CardTitle>
        </div>
        <CardText>{t("iosHint.body")}</CardText>
        <ol className="flex flex-col gap-2 text-ink">
          <li className="flex items-center gap-2">
            <Share aria-hidden="true" className="size-5 shrink-0 text-ink-2" />
            {t("iosHint.share")}
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-2"
            />
            {t("iosHint.add")}
          </li>
          <li className="flex items-center gap-2">
            <BellRing
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-2"
            />
            {t("iosHint.open")}
          </li>
        </ol>
      </Card>
    );
  }

  const status =
    state === "on"
      ? t("on", { device })
      : state === "off"
        ? t("off")
        : state === "denied"
          ? t("denied", { device })
          : state === "iosTooOld"
            ? t("iosVersion")
            : t("demo");
  const canSwitch = state === "on" || state === "off";

  return (
    <PageSection title={title} className={cn(hidden, className)}>
      <ListGroup>
        <ListRow
          leading={<BellRing />}
          title={<span id={titleId}>{t("row", { device })}</span>}
          subtitle={status}
          trailing={
            canSwitch ? (
              <span className="flex items-center gap-2">
                {working ? <Spinner className="size-5 text-ink-2" /> : null}
                <Switch
                  aria-labelledby={titleId}
                  checked={state === "on"}
                  disabled={working}
                  onChange={(on) => (on ? turnOn() : turnOff())}
                />
              </span>
            ) : undefined
          }
        />
        {state === "on" ? (
          <ListRow
            leading={<Send className="rtl:-scale-x-100" />}
            title={t("test.action")}
            subtitle={
              test === "sending"
                ? t("test.sending")
                : test
                  ? t(`test.${test}`)
                  : t("test.hint")
            }
            disabled={test === "sending"}
            onClick={sendTest}
          />
        ) : null}
      </ListGroup>
      {failed ? (
        <p role="alert" className="px-1 font-medium text-danger text-sm">
          {t(failed === "off" ? "failedOff" : "failed")}
        </p>
      ) : null}
      {test && test !== "sending" ? (
        <p className="sr-only" role="status">
          {t(`test.${test}`)}
        </p>
      ) : null}
    </PageSection>
  );
}
