import { CAPTCHA_LOAD_MS, type CaptchaState } from "@domain/turnstile";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CaptchaPage,
  captchaControlFor,
  captchaLineAlerts,
  captchaLineOf,
  createCaptchaControl,
  createDemoCaptcha,
  retryFocusOf,
  type TurnstileApi,
  type TurnstileOptions,
} from "./captcha-control";

/*
 * The "אני לא רובוט" check's own side (P9b), with Turnstile's script stood
 * in for: how a widget is drawn, the token a send takes (spent at once, the
 * next check started), a press that waits for a check on its way and goes
 * by itself once it lands, and never for one that failed or can't load;
 * the script's own failures, and a widget that goes with its place.
 */

/** Turnstile as a page has it, every widget it drew kept to answer for. */
function fakeTurnstile() {
  const drawn: {
    id: string;
    container: HTMLElement;
    options: TurnstileOptions;
  }[] = [];
  const resets: string[] = [];
  const removed: string[] = [];
  const api: TurnstileApi = {
    render: (container, options) => {
      const id = `w${drawn.length + 1}`;
      drawn.push({ id, container, options });
      return id;
    },
    reset: (id) => {
      resets.push(id);
    },
    remove: (id) => {
      removed.push(id);
    },
  };
  /** The newest widget's options: what Cloudflare answers through. */
  const last = () => {
    const widget = drawn.at(-1);
    if (!widget) throw new Error("no widget drawn");
    return widget.options;
  };
  return { api, drawn, resets, removed, last };
}

const box = () => ({}) as HTMLElement;

function setUp(page: CaptchaPage = { scriptFailed: false }) {
  const control = createCaptchaControl({
    siteKey: "1x00000000000000000000AA",
    action: "sign-in",
    language: "he",
    page,
  });
  const turnstile = fakeTurnstile();
  const container = box();
  control.attach(container, turnstile.api, 340);
  return { control, turnstile, container };
}

/** Whether a promise has settled, after what is queued now has run. */
async function settled<T>(promise: Promise<T>) {
  let done = false;
  promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe("the widget", () => {
  it("is drawn hidden until Cloudflare asks, in the screen's language, sized for its room", () => {
    const { turnstile } = setUp();
    const options = turnstile.last();
    expect(options).toMatchObject({
      sitekey: "1x00000000000000000000AA",
      action: "sign-in",
      language: "he",
      theme: "auto",
      size: "flexible",
      appearance: "interaction-only",
      execution: "render",
      retry: "auto",
      "refresh-expired": "auto",
      "response-field": false,
      "feedback-enabled": false,
    });
    const narrow = createCaptchaControl({
      siteKey: "1x00000000000000000000AA",
      action: "join",
      language: "en",
      page: { scriptFailed: false },
    });
    narrow.attach(box(), turnstile.api, 294);
    expect(turnstile.last()).toMatchObject({
      size: "compact",
      action: "join",
      language: "en",
    });
  });

  it("says Cloudflare's errors as handled", () => {
    const { turnstile } = setUp();
    expect(turnstile.last()["error-callback"]("600010")).toBe(true);
  });

  it("is drawn once per place, a new place taking the old one's, and goes with it", () => {
    const { control, turnstile, container } = setUp();
    control.attach(container, turnstile.api, 340);
    expect(turnstile.drawn).toHaveLength(1);
    const next = box();
    control.attach(next, turnstile.api, 340);
    expect(turnstile.removed).toEqual(["w1"]);
    expect(turnstile.drawn.map((widget) => widget.container)).toEqual([
      container,
      next,
    ]);
    // The old place going leaves the new one's widget.
    control.detach(container);
    expect(turnstile.removed).toEqual(["w1"]);
    control.detach(next);
    expect(turnstile.removed).toEqual(["w1", "w2"]);
  });

  it("hears no answer from a widget gone since", () => {
    const { control, turnstile } = setUp();
    const old = turnstile.last();
    control.attach(box(), turnstile.api, 340);
    old.callback("OLD.TOKEN");
    old["error-callback"]("110200");
    expect(control.snapshot()).toMatchObject({ state: "loading", token: null });
  });
});

describe("a token", () => {
  it("is ready once Cloudflare gives it, and taken at once, the next check started", async () => {
    const { control, turnstile } = setUp();
    turnstile.last().callback("XXXX.DUMMY.TOKEN.XXXX");
    expect(control.snapshot()).toEqual({
      state: "ready",
      token: "XXXX.DUMMY.TOKEN.XXXX",
      waiting: false,
      retried: false,
    });
    expect(await control.take()).toBe("XXXX.DUMMY.TOKEN.XXXX");
    expect(turnstile.resets).toEqual(["w1"]);
    expect(control.snapshot()).toEqual({
      state: "loading",
      token: null,
      waiting: false,
      retried: false,
    });
  });

  it("goes with one press only: spent by a form, the next check starts", () => {
    const { control, turnstile } = setUp();
    turnstile.last().callback("FIRST");
    control.spend();
    expect(control.snapshot()).toMatchObject({ state: "loading", token: null });
    expect(turnstile.resets).toEqual(["w1"]);
    // Nothing to spend: nothing reset.
    control.spend();
    expect(turnstile.resets).toEqual(["w1"]);
    turnstile.last().callback("SECOND");
    expect(control.snapshot().token).toBe("SECOND");
  });

  it("expires and comes again", () => {
    const { control, turnstile } = setUp();
    turnstile.last().callback("FIRST");
    turnstile.last()["expired-callback"]();
    expect(control.snapshot()).toMatchObject({ state: "loading", token: null });
    turnstile.last().callback("RENEWED");
    expect(control.snapshot()).toMatchObject({
      state: "ready",
      token: "RENEWED",
    });
  });
});

describe("a press before the check is done", () => {
  it("waits, and goes with the token once it lands", async () => {
    const { control, turnstile } = setUp();
    const taken = control.take();
    expect(control.snapshot().waiting).toBe(true);
    expect(await settled(taken)).toBe(false);
    turnstile.last().callback("XXXX.DUMMY.TOKEN.XXXX");
    expect(await taken).toBe("XXXX.DUMMY.TOKEN.XXXX");
    // Spent with the press: never kept for another, and the next started.
    expect(control.snapshot()).toEqual({
      state: "loading",
      token: null,
      waiting: false,
      retried: false,
    });
    expect(turnstile.resets).toEqual(["w1"]);
  });

  it("waits through a tick Cloudflare asks for", async () => {
    const { control, turnstile } = setUp();
    turnstile.last()["before-interactive-callback"]();
    expect(control.snapshot().state).toBe("tap");
    const taken = control.take();
    expect(control.snapshot()).toMatchObject({ state: "tap", waiting: true });
    turnstile.last()["after-interactive-callback"]();
    expect(control.snapshot()).toMatchObject({
      state: "loading",
      waiting: true,
    });
    turnstile.last().callback("TICKED");
    expect(await taken).toBe("TICKED");
    expect(control.snapshot().waiting).toBe(false);
  });

  it("goes without a token when the check fails meanwhile, or can't load", async () => {
    const first = setUp();
    const failed = first.control.take();
    first.turnstile.last()["error-callback"]("600010");
    expect(await failed).toBeUndefined();
    expect(first.control.snapshot()).toEqual({
      state: "failed",
      token: null,
      waiting: false,
      retried: false,
    });

    const second = setUp();
    const blocked = second.control.take();
    second.control.scriptFailed();
    expect(await blocked).toBeUndefined();
    expect(second.control.snapshot().waiting).toBe(false);
  });

  it("never waits on a check that failed or can't run", async () => {
    const { control, turnstile } = setUp();
    turnstile.last()["error-callback"]("300010");
    expect(await settled(control.take())).toBe(true);
    expect(await control.take()).toBeUndefined();
    turnstile.last()["error-callback"]("110200");
    expect(control.snapshot().state).toBe("unavailable");
    expect(await control.take()).toBeUndefined();
    expect(control.snapshot().waiting).toBe(false);
  });
});

describe("a check that failed", () => {
  it("is tried again from its button, and a later token makes it ready", () => {
    const { control, turnstile } = setUp();
    turnstile.last()["error-callback"]("600010");
    control.retry();
    expect(turnstile.resets).toEqual(["w1"]);
    expect(control.snapshot().state).toBe("loading");
    turnstile.last()["error-callback"]("600010");
    // Cloudflare tries again by itself too.
    turnstile.last().callback("LATER");
    expect(control.snapshot()).toMatchObject({
      state: "ready",
      token: "LATER",
    });
  });

  it("is tried again only once it failed", () => {
    const { control, turnstile } = setUp();
    control.retry();
    expect(turnstile.resets).toEqual([]);
    expect(control.snapshot().retried).toBe(false);
  });

  it("says its try until the try is over: its token gone with a send", async () => {
    const { control, turnstile } = setUp();
    turnstile.last()["error-callback"]("600010");
    control.retry();
    expect(control.snapshot()).toMatchObject({
      state: "loading",
      retried: true,
    });
    // A tick asked for, and its answer, are still the try's.
    turnstile.last()["before-interactive-callback"]();
    expect(control.snapshot()).toMatchObject({ state: "tap", retried: true });
    turnstile.last()["after-interactive-callback"]();
    turnstile.last().callback("PASSED");
    expect(control.snapshot()).toMatchObject({
      state: "ready",
      retried: true,
    });
    expect(await control.take()).toBe("PASSED");
    expect(control.snapshot()).toMatchObject({
      state: "loading",
      retried: false,
    });

    // A form's press spends it just the same.
    turnstile.last()["error-callback"]("600010");
    control.retry();
    turnstile.last().callback("AGAIN");
    control.spend();
    expect(control.snapshot().retried).toBe(false);

    // So does a press that waited for the try's token.
    turnstile.last()["error-callback"]("600010");
    control.retry();
    const pressed = control.take();
    expect(control.snapshot()).toMatchObject({ waiting: true, retried: true });
    turnstile.last().callback("WAITED");
    expect(await pressed).toBe("WAITED");
    expect(control.snapshot().retried).toBe(false);
  });

  it("ends its try when it fails again, or can't run", () => {
    const { control, turnstile } = setUp();
    turnstile.last()["error-callback"]("600010");
    control.retry();
    turnstile.last()["error-callback"]("600010");
    expect(control.snapshot()).toMatchObject({
      state: "failed",
      retried: false,
    });
    control.retry();
    turnstile.last()["error-callback"]("110200");
    expect(control.snapshot()).toMatchObject({
      state: "unavailable",
      retried: false,
    });
  });
});

describe("the box's line", () => {
  const at = (state: CaptchaState, { waiting = false, retried = false } = {}) =>
    captchaLineOf({ state, waiting, retried });

  it("says nothing while the check asks nothing", () => {
    expect(at("loading")).toBeNull();
    expect(at("ready")).toBeNull();
  });

  it("says the tick, a press waiting, a failure and a check that didn't load", () => {
    expect(at("tap")).toBe("tap");
    expect(at("tap", { waiting: true })).toBe("tap");
    expect(at("loading", { waiting: true })).toBe("waiting");
    expect(at("failed")).toBe("failed");
    expect(at("unavailable")).toBe("unavailable");
    expect(captchaLineAlerts("failed")).toBe(true);
    expect(captchaLineAlerts("unavailable")).toBe(true);
    for (const line of ["tap", "waiting", "rechecking", "passed"] as const) {
      expect(captchaLineAlerts(line), line).toBe(false);
    }
  });

  it("says a try from its button, started and then passed", () => {
    expect(at("loading", { retried: true })).toBe("rechecking");
    expect(at("ready", { retried: true })).toBe("passed");
    expect(at("tap", { retried: true })).toBe("tap");
    expect(at("loading", { waiting: true, retried: true })).toBe("waiting");
  });
});

describe("the focus after its retry", () => {
  it("is the line while the try goes, the button again when it fails, and nothing after", () => {
    for (const state of ["loading", "tap", "ready"] as const) {
      expect(retryFocusOf({ state, retried: true }), state).toBe("line");
      expect(retryFocusOf({ state, retried: false }), state).toBeNull();
    }
    expect(retryFocusOf({ state: "failed", retried: false })).toBe("retry");
    expect(retryFocusOf({ state: "unavailable", retried: false })).toBe("line");
  });
});

describe("the script", () => {
  it("is unavailable when it doesn't load, and so is every box after on the page", () => {
    const page: CaptchaPage = { scriptFailed: false };
    const control = createCaptchaControl({
      siteKey: "1x00000000000000000000AA",
      action: "sign-in",
      language: "he",
      page,
    });
    control.scriptFailed();
    expect(control.snapshot().state).toBe("unavailable");
    const later = createCaptchaControl({
      siteKey: "1x00000000000000000000AA",
      action: "join",
      language: "he",
      page,
    });
    expect(later.snapshot().state).toBe("unavailable");
  });

  describe("its deadline", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const fresh = () =>
      createCaptchaControl({
        siteKey: "1x00000000000000000000AA",
        action: "bank-code",
        language: "he",
        page: { scriptFailed: false },
      });

    it("runs only while a box is up: a screen with none waits for nothing", () => {
      vi.useFakeTimers();
      // The bank step on its saved account: the screen's check, and no box.
      const control = fresh();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS * 4);
      expect(control.snapshot().state).toBe("loading");
      // "החלפת החשבון": the box comes up, and its script has its time.
      const stop = control.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS - 1);
      expect(control.snapshot().state).toBe("loading");
      vi.advanceTimersByTime(1);
      expect(control.snapshot().state).toBe("unavailable");
      stop();
    });

    it("ends with its box, and starts again with the next", () => {
      vi.useFakeTimers();
      const control = fresh();
      const stop = control.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS - 1);
      stop();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS);
      expect(control.snapshot().state).toBe("loading");
      control.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS);
      expect(control.snapshot().state).toBe("unavailable");
    });

    it("leaves a widget drawn to answer for itself, one drawn late too", () => {
      vi.useFakeTimers();
      const control = fresh();
      const turnstile = fakeTurnstile();
      control.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS / 2);
      control.attach(box(), turnstile.api, 340);
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS);
      expect(control.snapshot().state).toBe("loading");
      // A box drawn again once there is a widget waits for nothing.
      control.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS);
      expect(control.snapshot().state).toBe("loading");
      // A script that came after the deadline draws a widget all the same.
      const late = fresh();
      late.awaitScript();
      vi.advanceTimersByTime(CAPTCHA_LOAD_MS);
      expect(late.snapshot().state).toBe("unavailable");
      late.attach(box(), turnstile.api, 340);
      expect(late.snapshot().state).toBe("loading");
    });
  });

  it("is unavailable when Cloudflare won't draw the widget, or in a browser it doesn't run in", () => {
    const control = createCaptchaControl({
      siteKey: "1x00000000000000000000AA",
      action: "sign-in",
      language: "he",
      page: { scriptFailed: false },
    });
    control.attach(
      box(),
      {
        render: () => undefined,
        reset: () => {},
        remove: () => {},
      },
      340,
    );
    expect(control.snapshot().state).toBe("unavailable");
    const { control: other, turnstile } = setUp();
    turnstile.last()["unsupported-callback"]();
    expect(other.snapshot().state).toBe("unavailable");
  });
});

describe("a screen's language", () => {
  const real = { siteKey: "1x00000000000000000000AA" };

  it("keeps the control while it stays, and makes one in the new language once it changes", () => {
    const he = captchaControlFor(null, real, "bank-code", "he");
    expect(captchaControlFor(he, real, "bank-code", "he")).toBe(he);
    const en = captchaControlFor(he, real, "bank-code", "en");
    expect(en).not.toBe(he);
    expect(en.language).toBe("en");
    const turnstile = fakeTurnstile();
    en.control.attach(box(), turnstile.api, 340);
    expect(turnstile.last()).toMatchObject({
      language: "en",
      action: "bank-code",
    });
    expect(captchaControlFor(en, real, "bank-code", "en")).toBe(en);
  });

  it("keeps the twin's stand-in, which speaks none", () => {
    const demo = captchaControlFor(null, { demo: "tap" }, "bank-code", "he");
    expect(demo.control.demo).toBe(true);
    expect(captchaControlFor(demo, { demo: "tap" }, "bank-code", "en")).toBe(
      demo,
    );
  });

  it("hands a waiting press on to the new control, which it goes with", async () => {
    const old = setUp();
    const pressed = old.control.take();
    expect(old.control.snapshot().waiting).toBe(true);
    const next = captchaControlFor(
      { language: "he", control: old.control },
      { siteKey: "1x00000000000000000000AA" },
      "sign-in",
      "en",
    ).control;
    old.control.handOver(next);
    expect(old.control.snapshot().waiting).toBe(false);
    expect(next.snapshot().waiting).toBe(true);
    // The old widget's answer is no longer the press's.
    old.turnstile.last().callback("OLD.TOKEN");
    expect(await settled(pressed)).toBe(false);
    const turnstile = fakeTurnstile();
    next.attach(box(), turnstile.api, 340);
    turnstile.last().callback("NEW.TOKEN");
    expect(await pressed).toBe("NEW.TOKEN");
  });
});

describe("listeners", () => {
  it("hear each change, and stop once they leave", () => {
    const { control, turnstile } = setUp();
    let heard = 0;
    const leave = control.subscribe(() => {
      heard += 1;
    });
    turnstile.last().callback("A");
    expect(heard).toBe(1);
    const same = control.snapshot();
    expect(control.snapshot()).toBe(same);
    leave();
    turnstile.last()["expired-callback"]();
    expect(heard).toBe(1);
  });
});

describe("the design twin's stand-in", () => {
  it("stays in its state, and a press goes at once with no token", async () => {
    for (const state of ["ready", "tap", "failed", "unavailable"] as const) {
      const demo = createDemoCaptcha(state);
      expect(demo.demo).toBe(true);
      expect(demo.snapshot()).toEqual({
        state,
        token: null,
        waiting: false,
        retried: false,
      });
      expect(await demo.take()).toBeUndefined();
      demo.retry();
      expect(demo.snapshot().state).toBe(state);
    }
    expect(createDemoCaptcha("waiting").snapshot()).toEqual({
      state: "loading",
      token: null,
      waiting: true,
      retried: false,
    });
  });
});
