"use client";

import {
  type InstallBrowser,
  type InstallPressed,
  type InstallStart,
  type InstallState,
  installAnswer,
  installMenu,
  installShown,
} from "@domain/install";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { Card, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { focusOrSay } from "@ui/focus-after";
import { Download, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  installStartHere,
  promptInstall,
  subscribeInstall,
} from "./install-prompt";

/**
 * Where the button is drawn: inside Today's notifications card, last, after
 * the card's own buttons (`PushAskTodayCard`), or as a card of its own in
 * the notification settings, beside this phone's switch.
 */
export type InstallShape = "card" | "settings";

/** A state the twin (/design/shell) starts the button in, by `?install=`. */
export type InstallTwin = Exclude<InstallState, "none">;

/** The twin's stand-in for Chrome's question. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 600));

const noChange = () => () => {};
/** Whose menu the words name, by the browser; the server says Chrome's. */
const menuHere = (): InstallBrowser => installMenu(navigator.userAgent);
const menuOnServer = (): InstallBrowser => "chrome";
const nothingOnServer = (): InstallStart => "none";

/**
 * "התקנת האפליקציה" on Android (closing the pilot, PR 7): where Chrome
 * offered to install the app (its `beforeinstallprompt`, caught by the root
 * layout's script and kept for this press, `app/install-capture.ts`), a
 * button that asks Chrome there and then, and says what came of it:
 * installed, or declined with the menu's words for later. With no event
 * (another browser, or Chrome hasn't offered it yet), the words say where
 * the browser's menu does it ("בתפריט של Chrome: הוספה למסך הבית"), and
 * the button takes their place if Chrome offers it while the page is open.
 * Nothing inside the installed app, on an iPhone or iPad (which have their
 * own steps), on a computer, or once this browser saw it installed
 * (`installStart`). It is drawn only where notifications are offered: never
 * in a demo business or while viewing as someone, where neither Today's
 * card nor the settings' switch is, and never on the business's clock
 * station, which isn't the person's device. `twin`: the state it starts in
 * on /design/shell, which asks the browser nothing; a press there installs
 * after a moment's stand-in.
 */
export function InstallButton({
  shape,
  twin,
  className,
}: {
  shape: InstallShape;
  twin?: InstallTwin;
  className?: string;
}) {
  return twin ? (
    <TwinInstall start={twin} shape={shape} className={className} />
  ) : (
    <LiveInstall shape={shape} className={className} />
  );
}

function LiveInstall({
  shape,
  className,
}: {
  shape: InstallShape;
  className?: string;
}) {
  const start = useSyncExternalStore(
    subscribeInstall,
    installStartHere,
    nothingOnServer,
  );
  const browser = useSyncExternalStore(noChange, menuHere, menuOnServer);
  // What a press came to, in this page: it outlasts the event it used up,
  // until the page hears more (installed from the menu, or offered again).
  const [pressed, setPressed] = useState<InstallPressed | null>(null);
  const state = installShown(start, pressed);
  async function install() {
    if (state !== "ready") return;
    // Chrome is asked within this press, before anything is awaited; the
    // event is used up by then.
    const asked = promptInstall();
    setPressed({ state: "prompting", over: installStartHere() });
    const outcome = await asked;
    setPressed({ state: installAnswer(outcome), over: installStartHere() });
  }
  return (
    <InstallPiece
      state={state}
      browser={browser}
      shape={shape}
      onInstall={install}
      className={className}
    />
  );
}

function TwinInstall({
  start,
  shape,
  className,
}: {
  start: InstallTwin;
  shape: InstallShape;
  className?: string;
}) {
  const [state, setState] = useState<InstallState>(start);
  async function install() {
    if (state !== "ready") return;
    setState("prompting");
    await pause();
    setState("installed");
  }
  return (
    <InstallPiece
      state={state}
      browser="chrome"
      shape={shape}
      onInstall={install}
      className={className}
    />
  );
}

/**
 * The button with what it says after each press: the words are said once
 * the answer comes, and the keyboard, left with nowhere once the button
 * went, goes to them (`focusOrSay`).
 */
function InstallPiece({
  state,
  browser,
  shape,
  onInstall,
  className,
}: {
  state: InstallState;
  browser: InstallBrowser;
  shape: InstallShape;
  onInstall: () => void;
  className?: string;
}) {
  const t = useTranslations("app.notifications.install");
  const words = useRef<HTMLParagraphElement>(null);
  const pressed = useRef(false);
  const said = installWords(t, state, browser);
  useEffect(() => {
    if (!pressed.current || state === "prompting") return;
    pressed.current = false;
    focusOrSay([words.current], () => announce(said));
  }, [state, said]);
  return (
    <InstallView
      state={state}
      browser={browser}
      shape={shape}
      onInstall={() => {
        pressed.current = true;
        onInstall();
      }}
      wordsRef={words}
      className={className}
    />
  );
}

type InstallWords = ReturnType<
  typeof useTranslations<"app.notifications.install">
>;

/** What the offer says in each state; nothing while it shows nothing. */
function installWords(
  t: InstallWords,
  state: InstallState,
  browser: InstallBrowser,
): string {
  switch (state) {
    case "none":
      return "";
    case "ready":
    case "prompting":
      return t("hint");
    case "installed":
      return t("installed");
    case "dismissed":
      return t("dismissed", { browser });
    default:
      return t("menu", { browser });
  }
}

/**
 * The offer in one state, as it draws: its words, and the button while
 * Chrome's event is there to ask (with its spinner while it asks). In
 * Today's card (`card`), after the card's own buttons, under a line, so the
 * card's question is answered first and an offer that comes late only grows
 * the card below them; its button across the card while the card's are, as
 * theirs. In the settings, a quiet card of its own with its title
 * ("האפליקציה במסך הבית"), a region by that name. Drawn by `InstallButton`,
 * and by the /design gallery in each state, with nothing behind its button;
 * `landmark` false leaves out the region, for a page that draws several
 * with the same name.
 */
export function InstallView({
  state,
  browser,
  shape,
  onInstall,
  wordsRef,
  landmark = true,
  className,
}: {
  state: InstallState;
  browser: InstallBrowser;
  shape: InstallShape;
  onInstall?: () => void;
  wordsRef?: Ref<HTMLParagraphElement>;
  landmark?: boolean;
  className?: string;
}) {
  const t = useTranslations("app.notifications.install");
  const titleId = useId();
  if (state === "none") return null;
  const asking = state === "prompting";
  const inCard = shape === "card";
  const piece = (
    <div className="flex flex-col items-start gap-3">
      <p ref={wordsRef} className="text-pretty text-base text-ink-2">
        {installWords(t, state, browser)}
      </p>
      {state === "ready" || asking ? (
        <Button
          variant="secondary"
          loading={asking}
          onClick={onInstall}
          className={inCard ? "w-full @min-[40rem]:w-auto" : undefined}
        >
          {asking ? null : <Download aria-hidden="true" />}
          {t("action")}
        </Button>
      ) : null}
    </div>
  );
  if (inCard) {
    return (
      <div className={cn("border-line border-t pt-4", className)}>{piece}</div>
    );
  }
  return (
    <Card
      tone="flat"
      padding="lg"
      role={landmark ? "region" : undefined}
      aria-labelledby={landmark ? titleId : undefined}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
        >
          <Smartphone />
        </span>
        <CardTitle as="h2" id={titleId}>
          {t("title")}
        </CardTitle>
      </div>
      {piece}
    </Card>
  );
}
