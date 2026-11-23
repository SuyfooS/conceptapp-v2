import {
  CAPTCHA_LOAD_MS,
  type CaptchaAction,
  type CaptchaEvent,
  type CaptchaSetup,
  type CaptchaState,
  captchaSizeFor,
  nextCaptchaState,
  pressWaits,
} from "@domain/turnstile";

/*
 * The "אני לא רובוט" check's own side (P9b), kept apart from React so it can
 * be tested on its own: one Turnstile widget at a time, where its check
 * stands, and the token a send takes. `@ui/captcha` draws it. Each token
 * goes with one send only: the moment one is taken, the widget starts the
 * next check, so a new code never reuses one.
 */

/** What Turnstile's script gives the page (`window.turnstile`), as far as the app uses it. */
export type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: TurnstileOptions,
  ) => string | null | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

/** Turnstile's render options, as the app sets them. */
export type TurnstileOptions = {
  sitekey: string;
  action: CaptchaAction;
  language: "he" | "en";
  theme: "auto";
  size: "flexible" | "compact";
  appearance: "interaction-only";
  execution: "render";
  retry: "auto";
  "refresh-expired": "auto";
  "response-field": false;
  "feedback-enabled": false;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": (code: string | number) => boolean;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
  "timeout-callback": () => void;
  "unsupported-callback": () => void;
};

/** Where the check stands, its token, and whether a press waits for it. */
export type CaptchaSnapshot = {
  state: CaptchaState;
  token: string | null;
  waiting: boolean;
  /**
   * Tried again from "בדיקה מחדש", until that try is over: its token gone
   * with a send, or the check failed again or can't run. Meanwhile the box
   * says how it goes, since the button pressed went with the failure.
   */
  retried: boolean;
};

/** What the box says for where the check stands (`ui.captcha`'s words). */
export type CaptchaLine =
  | "tap"
  | "waiting"
  | "failed"
  | "unavailable"
  | "rechecking"
  | "passed";

/**
 * The box's line, none while the check asks nothing: the tick asked for,
 * a press waiting, a failure, a check that didn't load, and after "בדיקה
 * מחדש" the try itself ("בודקים שוב…", then "הבדיקה עברה…"), so the person
 * who pressed hears it start and end.
 */
export function captchaLineOf({
  state,
  waiting,
  retried,
}: Pick<CaptchaSnapshot, "state" | "waiting" | "retried">): CaptchaLine | null {
  if (state === "tap") return "tap";
  if (waiting) return "waiting";
  if (state === "failed" || state === "unavailable") return state;
  if (retried) return state === "ready" ? "passed" : "rechecking";
  return null;
}

/** A line that is an alert (failed, didn't load); every other is a status. */
export function captchaLineAlerts(line: CaptchaLine): boolean {
  return line === "failed" || line === "unavailable";
}

/**
 * Where the keyboard's focus goes while a check is tried again, once it
 * fell to the page: "בדיקה מחדש" goes with the failure it was for, so the
 * box's line takes the focus and says how the try goes; a failure again
 * brings the button back, which takes it. None once the try is over.
 */
export function retryFocusOf({
  state,
  retried,
}: Pick<CaptchaSnapshot, "state" | "retried">): "line" | "retry" | null {
  if (state === "failed") return "retry";
  if (state === "unavailable" || retried) return "line";
  return null;
}

export type CaptchaControl = {
  /** The design twin's stand-in: nothing to load, no token. */
  demo: boolean;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => CaptchaSnapshot;
  /**
   * Draws the widget into `container`, `width` the room it has there; once
   * per container, and a new one takes the place of the old.
   */
  attach: (container: HTMLElement, api: TurnstileApi, width: number) => void;
  /** The widget goes with its container (or with whatever it is in). */
  detach: (container?: HTMLElement) => void;
  scriptFailed: () => void;
  /**
   * A box is up to draw the widget: unless one is drawn within
   * `CAPTCHA_LOAD_MS`, the script didn't load and the check is unavailable.
   * Started by the box, never by the screen, which may have no box for a
   * long while (the bank step's saved account). What it returns ends the
   * wait, as the box goes.
   */
  awaitScript: () => () => void;
  /**
   * The token for one send, spent: at once when there is one; on its way or
   * asking for a tick, once it comes; none when the check failed or can't
   * run, since a press never waits for that.
   */
  take: () => Promise<string | undefined>;
  /** A form's press took the token as it went: the next check starts. */
  spend: () => void;
  /** "בדיקה מחדש": a failed check, tried again (`retried` until it is over). */
  retry: () => void;
  /**
   * A new control took this one's place (the screen's language changed):
   * each press waiting here waits for the new one's token instead.
   */
  handOver: (next: CaptchaControl) => void;
};

/**
 * What the page remembers between checks: a script that failed to load
 * doesn't come back without a reload, so a later box is unavailable at once.
 */
export type CaptchaPage = { scriptFailed: boolean };

const PAGE: CaptchaPage = { scriptFailed: false };

export function createCaptchaControl({
  siteKey,
  action,
  language,
  page = PAGE,
}: {
  siteKey: string;
  action: CaptchaAction;
  language: "he" | "en";
  page?: CaptchaPage;
}): CaptchaControl {
  let now: CaptchaSnapshot = {
    state: page.scriptFailed ? "unavailable" : "loading",
    token: null,
    waiting: false,
    retried: false,
  };
  const listeners = new Set<() => void>();
  let widget: { container: HTMLElement; id: string; api: TurnstileApi } | null =
    null;
  // Which widget an answer is for: one from a widget gone since is ignored.
  let drawn = 0;
  let everDrawn = false;
  const waiters: ((token: string | undefined) => void)[] = [];
  // A try from "בדיקה מחדש" under way, until its token goes or it ends.
  let retried = false;

  const publish = (next: Omit<CaptchaSnapshot, "waiting" | "retried">) => {
    now = { ...next, waiting: waiters.length > 0, retried };
    for (const listener of [...listeners]) listener();
  };

  /** The widget starts the next check: a token taken, or a check tried again. */
  const resetWidget = () => {
    if (!widget) return;
    try {
      widget.api.reset(widget.id);
    } catch {
      // A widget Cloudflare already let go: the next one comes on its own.
    }
  };

  const apply = (event: CaptchaEvent, token: string | null = null) => {
    let state = nextCaptchaState(now.state, event);
    let kept = state === "ready" ? token : null;
    const waiter = kept !== null ? waiters.shift() : undefined;
    if (waiter && kept !== null) {
      // A press waits for this token: it goes with it, and the next check starts.
      waiter(kept);
      kept = null;
      retried = false;
      resetWidget();
      state = nextCaptchaState(state, { kind: "reset" });
    }
    // A try that failed again, or can't run, is over: the box says so.
    if (state === "failed" || state === "unavailable") retried = false;
    if (!pressWaits(state)) {
      // Nothing to wait for: every press waiting goes without a token.
      for (const release of waiters.splice(0)) release(undefined);
    }
    publish({ state, token: kept });
  };

  const optionsFor = (mine: number, width: number): TurnstileOptions => {
    const ours =
      (run: () => void) =>
      (..._: unknown[]) => {
        if (mine === drawn) run();
      };
    return {
      sitekey: siteKey,
      action,
      language,
      theme: "auto",
      size: captchaSizeFor(width),
      // Nothing shows while Cloudflare asks nothing.
      appearance: "interaction-only",
      execution: "render",
      retry: "auto",
      "refresh-expired": "auto",
      // The app posts the token in its own field.
      "response-field": false,
      "feedback-enabled": false,
      callback: (token) => {
        if (mine === drawn) apply({ kind: "token" }, token);
      },
      "expired-callback": ours(() => apply({ kind: "expired" })),
      "error-callback": (code) => {
        if (mine === drawn) apply({ kind: "error", code: String(code) });
        // Said on screen already: Cloudflare needn't throw it.
        return true;
      },
      "before-interactive-callback": ours(() => apply({ kind: "interactive" })),
      "after-interactive-callback": ours(() => apply({ kind: "settled" })),
      "timeout-callback": ours(() => apply({ kind: "reset" })),
      "unsupported-callback": ours(() => apply({ kind: "unsupported" })),
    };
  };

  const detach = (container?: HTMLElement) => {
    if (!widget || (container && widget.container !== container)) return;
    const { api, id } = widget;
    widget = null;
    drawn += 1;
    try {
      api.remove(id);
    } catch {
      // Gone already.
    }
  };

  return {
    demo: false,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => now,
    attach: (container, api, width) => {
      if (widget?.container === container) return;
      detach();
      drawn += 1;
      everDrawn = true;
      const mine = drawn;
      // Before it is drawn: an answer may come while it is.
      apply({ kind: "rendered" });
      let id: string | null | undefined;
      try {
        id = api.render(container, optionsFor(mine, width));
      } catch {
        id = undefined;
      }
      if (typeof id !== "string") {
        apply({ kind: "unsupported" });
        return;
      }
      if (mine === drawn) widget = { container, id, api };
    },
    detach,
    scriptFailed: () => {
      page.scriptFailed = true;
      apply({ kind: "scriptFailed" });
    },
    awaitScript: () => {
      if (everDrawn) return () => {};
      const late = setTimeout(() => {
        // Only while no script came: a widget drawn answers for itself.
        if (!everDrawn) apply({ kind: "loadTimeout" });
      }, CAPTCHA_LOAD_MS);
      return () => clearTimeout(late);
    },
    take: () => {
      if (now.state === "ready" && now.token !== null) {
        const token = now.token;
        retried = false;
        resetWidget();
        publish({
          state: nextCaptchaState(now.state, { kind: "reset" }),
          token: null,
        });
        return Promise.resolve(token);
      }
      if (!pressWaits(now.state)) return Promise.resolve(undefined);
      return new Promise((resolve) => {
        waiters.push(resolve);
        publish({ state: now.state, token: now.token });
      });
    },
    spend: () => {
      if (now.token === null) return;
      retried = false;
      resetWidget();
      publish({
        state: nextCaptchaState(now.state, { kind: "reset" }),
        token: null,
      });
    },
    retry: () => {
      if (now.state !== "failed") return;
      resetWidget();
      retried = true;
      apply({ kind: "reset" });
    },
    handOver: (next) => {
      if (waiters.length === 0) return;
      for (const waiter of waiters.splice(0)) next.take().then(waiter);
      publish({ state: now.state, token: now.token });
    },
  };
}

/**
 * The design twin's stand-in, drawn in one state and never changing: no
 * script, no token, and a press goes at once (`waiting`: a press held, as it
 * looks while the check is on its way).
 */
export function createDemoCaptcha(
  shown: CaptchaState | "waiting",
): CaptchaControl {
  const fixed: CaptchaSnapshot = {
    state: shown === "waiting" ? "loading" : shown,
    token: null,
    waiting: shown === "waiting",
    retried: false,
  };
  return {
    demo: true,
    subscribe: () => () => {},
    snapshot: () => fixed,
    attach: () => {},
    detach: () => {},
    scriptFailed: () => {},
    awaitScript: () => () => {},
    take: () => Promise.resolve(undefined),
    spend: () => {},
    retry: () => {},
    handOver: () => {},
  };
}

/** A screen's control, and the language its widget speaks. */
export type HeldCaptcha = { language: "he" | "en"; control: CaptchaControl };

/**
 * The control for a screen's check in `language`: the one the screen holds
 * while its language stays, and a new one once it changes (the file's
 * "English / עברית" keeps the screen up), since Cloudflare's box speaks the
 * language it was drawn in. The box draws the new one in the old one's
 * place. The twin's stand-in speaks none, and stays.
 */
export function captchaControlFor(
  held: HeldCaptcha | null,
  setup: CaptchaSetup,
  action: CaptchaAction,
  language: "he" | "en",
): HeldCaptcha {
  if (held && (held.control.demo || held.language === language)) return held;
  return {
    language,
    control:
      "demo" in setup
        ? createDemoCaptcha(setup.demo)
        : createCaptchaControl({ siteKey: setup.siteKey, action, language }),
  };
}
