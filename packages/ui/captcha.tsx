"use client";

import {
  type CaptchaAction,
  type CaptchaSetup,
  type CaptchaState,
  captchaLanguageOf,
  pressWaits,
  TURNSTILE_ORIGIN,
  TURNSTILE_SCRIPT,
} from "@domain/turnstile";
import Script from "next/script";
import { useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { preconnect } from "react-dom";
import { Button } from "./button";
import {
  askingFocusOf,
  type CaptchaControl,
  type CaptchaSnapshot,
  captchaControlFor,
  captchaLineAlerts,
  captchaLineOf,
  type HeldCaptcha,
  retryFocusOf,
  type TurnstileApi,
} from "./captcha-control";
import { cn } from "./cn";
import { focusLost } from "./focus-after";

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** A press held for the check: its form, and the button's name and value. */
type Press = { form: HTMLFormElement; name: string; value: string };

/** A screen's check, as `useCaptcha` gives it to the screen and its box. */
export type Captcha = {
  state: CaptchaState;
  token: string | null;
  /** A press waits for the check: its button shows it is on its way. */
  waiting: boolean;
  /** Tried again from "בדיקה מחדש", until that try is over. */
  retried: boolean;
  /** The token for one send (`CaptchaControl.take`), for a send in code. */
  take: () => Promise<string | undefined>;
  /**
   * A form's `onSubmit`, for a form that sends a code from a button whose
   * value is one of `intents`: while the check is on its way it holds the
   * press and sends it by itself once a token lands (or once none will);
   * otherwise the press goes now with the token in the box's field, spent.
   */
  holdSubmit: (
    event: FormEvent<HTMLFormElement>,
    intents: readonly string[],
  ) => void;
  retry: () => void;
  control: CaptchaControl;
  /** The widget's key; none for the twin's stand-in. */
  siteKey: string | null;
  /** The held press's button, as a field, for the one moment it goes. */
  going: { name: string; value: string } | null;
};

/** What the server draws for a real check: on its way, with nothing to show. */
const LOADING: CaptchaSnapshot = {
  state: "loading",
  token: null,
  waiting: false,
  retried: false,
};

/**
 * The "אני לא רובוט" check of a screen that sends an SMS code (P9b), one
 * for the screen's whole life, whichever of its steps is drawn: the real
 * widget with the deployment's key, in the screen's language, or the twin's
 * stand-in. A screen whose language changes while it is up gets a new
 * widget in the new language, and a press waiting goes on waiting for it.
 * The script's deadline runs only while a box is up (`CaptchaBox`), so a
 * screen drawn with none yet waits for nothing.
 */
export function useCaptcha(
  setup: CaptchaSetup,
  action: CaptchaAction,
): Captcha {
  const language = captchaLanguageOf(useLocale());
  const [kept, keep] = useState<HeldCaptcha>(() =>
    captchaControlFor(null, setup, action, language),
  );
  const mine = captchaControlFor(kept, setup, action, language);
  if (mine !== kept) keep(mine);
  const { control } = mine;
  // The control the new one took the place of hands on its waiting presses.
  const was = useRef(control);
  useEffect(() => {
    if (was.current === control) return;
    was.current.handOver(control);
    was.current = control;
  }, [control]);
  const now = useSyncExternalStore(control.subscribe, control.snapshot, () =>
    control.demo ? control.snapshot() : LOADING,
  );
  const [held, setHeld] = useState<Press | null>(null);
  const [going, setGoing] = useState<Press | null>(null);
  // The held press's own submit, while it is dispatched.
  const releasing = useRef(false);

  // A held press goes once the check is no longer on its way: with the
  // token that landed, or without one when it failed or can't run.
  if (held && !pressWaits(now.state)) {
    setHeld(null);
    setGoing(held);
  }

  // Sent once its button is a field of the form: the button itself shows
  // the press on its way, so it is disabled and a submit would leave it out.
  // After the drawing, so the box's field holds the token.
  useEffect(() => {
    if (!going) return;
    setGoing(null);
    if (!going.form.isConnected) return;
    releasing.current = true;
    try {
      going.form.requestSubmit();
    } finally {
      releasing.current = false;
    }
  }, [going]);

  const holdSubmit = (
    event: FormEvent<HTMLFormElement>,
    intents: readonly string[],
  ) => {
    if (control.demo) return;
    if (releasing.current) {
      control.spend();
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | HTMLInputElement
      | null;
    if (!submitter || !intents.includes(submitter.value)) {
      // Another press (the code's check, another number) lets a held one go.
      setHeld(null);
      return;
    }
    if (pressWaits(control.snapshot().state)) {
      // React runs no action for a submit whose default was prevented.
      event.preventDefault();
      setHeld({
        form: event.currentTarget,
        name: submitter.name,
        value: submitter.value,
      });
      return;
    }
    // The form's data is read from the page right after this, in the same
    // press, so it holds the token: the next check starts after.
    control.spend();
  };

  return {
    state: now.state,
    token: now.token,
    waiting: now.waiting || held !== null || going !== null,
    retried: now.retried,
    take: control.take,
    holdSubmit,
    retry: control.retry,
    control,
    siteKey: "siteKey" in setup ? setup.siteKey : null,
    going: going ? { name: going.name, value: going.value } : null,
  };
}

/**
 * The room the box has: the content width of the first box it is in, its
 * own place being hidden until Cloudflare asks for a tick.
 */
function roomOf(container: HTMLElement): number {
  let at = container.parentElement;
  while (at && at.clientWidth === 0) at = at.parentElement;
  if (!at) return 0;
  const style = window.getComputedStyle(at);
  return (
    at.clientWidth -
    Number.parseFloat(style.paddingInlineStart || "0") -
    Number.parseFloat(style.paddingInlineEnd || "0")
  );
}

/**
 * Where a screen's check is drawn, right above the press it is for: nothing
 * while it asks nothing; a line while a press waits for it ("בודקים שזה לא
 * רובוט."); Cloudflare's own box when it asks for a tick, with a line that
 * says to, brought into view if a press waits; and when it failed or didn't
 * load, a line that says so (with "בדיקה מחדש" for a failure). A press
 * never waits for those: the code goes without a token, and the auth server
 * decides. "בדיקה מחדש" goes with the failure it was for, so its line takes
 * the focus and says the try, started and then passed (or the tick it asks
 * for); a failure again brings the button back with the focus. `name` posts
 * the token with a form. Its parts are the parent's own rows, so a box that
 * shows nothing takes no room in the column, and `align` sets them at its
 * start or in its middle, as the column's own parts are. The twin's
 * stand-in draws each state with no Cloudflare: an empty place of the box's
 * size for a tick.
 */
export function CaptchaBox({
  captcha,
  name,
  align = "start",
}: {
  captcha: Captcha;
  /** The form field the token goes in; none for a send in code. */
  name?: string;
  /** Where its parts sit in the column: a form's start, or a centred card's middle. */
  align?: "start" | "center";
}) {
  const t = useTranslations("ui.captcha");
  const frame = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const again = useRef<HTMLButtonElement>(null);
  // "בדיקה מחדש" pressed: the focus follows the try until it is over.
  const following = useRef(false);
  const { state, token, waiting, retried, control, siteKey, going, retry } =
    captcha;
  if (siteKey) preconnect(TURNSTILE_ORIGIN);

  const draw = () => {
    const container = frame.current;
    if (!container) return;
    const api = window.turnstile;
    if (api) control.attach(container, api, roomOf(container));
    // A script that failed before reads as loaded once it is asked again.
    else control.scriptFailed();
  };

  // A box drawn again on a page whose script is in already, or a new
  // control in its place; the widget goes with its place. The script's
  // deadline runs while the box is up, from when it is first drawn.
  useEffect(() => {
    const container = frame.current;
    if (!container || control.demo) return;
    const api = window.turnstile;
    if (api) control.attach(container, api, roomOf(container));
    const stopWaiting = control.awaitScript();
    return () => {
      stopWaiting();
      control.detach(container);
    };
  }, [control]);

  // Asked for a tick while a press waits: the box comes into view (on a
  // phone the step's dock may cover it), and its line takes the focus the
  // busy button lost, so the ask is heard and the box is the next stop.
  const asking = askingFocusOf({ state, waiting }) === "line";
  useEffect(() => {
    if (!asking) return;
    frame.current?.scrollIntoView({ block: "center" });
    if (focusLost()) said.current?.focus();
  }, [asking]);

  // The pressed button went with the failure, and its focus to the page:
  // the line takes it, so the try is heard, and keeps it while the try
  // goes (its words change in place); a failure again brings the button
  // back, which takes it. Focus put elsewhere meanwhile stays there.
  useEffect(() => {
    if (!following.current) return;
    const to = retryFocusOf({ state, retried });
    if (!retried) following.current = false;
    const target =
      to === "retry" ? again.current : to === "line" ? said.current : null;
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    if (target && lost) target.focus();
  }, [state, retried]);

  const line = captchaLineOf({ state, waiting, retried });
  const alert = line !== null && captchaLineAlerts(line);
  const centred = align === "center";

  return (
    <div
      data-captcha={state}
      data-captcha-waiting={waiting || undefined}
      className="contents"
    >
      {name ? <input type="hidden" name={name} value={token ?? ""} /> : null}
      {going ? (
        <input type="hidden" name={going.name} value={going.value} />
      ) : null}
      {line ? (
        <p
          // An alert is drawn anew, so it is heard; a status line changes
          // its words in place, keeping the focus.
          key={alert ? "alert" : "status"}
          ref={said}
          role={alert ? "alert" : "status"}
          tabIndex={-1}
          className="px-1 text-base text-ink-2 outline-none"
        >
          {t(line)}
        </p>
      ) : null}
      {control.demo ? (
        state === "tap" ? (
          <div
            aria-hidden="true"
            data-captcha-frame
            className={cn(
              "h-[65px] w-full max-w-[300px] rounded-control bg-surface-2",
              centred && "self-center",
            )}
          />
        ) : null
      ) : (
        <div
          ref={frame}
          data-captcha-frame
          data-sitekey={siteKey ?? undefined}
          className={
            state !== "tap"
              ? "hidden"
              : centred
                ? "flex justify-center"
                : "flex"
          }
        />
      )}
      {state === "failed" ? (
        <Button
          ref={again}
          variant="ghost"
          className={centred ? "self-center" : "self-start"}
          onClick={() => {
            following.current = true;
            retry();
          }}
        >
          {t("retry")}
        </Button>
      ) : null}
      {siteKey ? (
        <Script
          id="cf-turnstile"
          src={TURNSTILE_SCRIPT}
          strategy="afterInteractive"
          onLoad={draw}
          onReady={draw}
          onError={control.scriptFailed}
        />
      ) : null}
    </div>
  );
}
