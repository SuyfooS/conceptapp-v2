import { describe, expect, it } from "vitest";
import {
  type CaptchaPage,
  createCaptchaControl,
  createDemoCaptcha,
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
    });
    expect(await control.take()).toBe("XXXX.DUMMY.TOKEN.XXXX");
    expect(turnstile.resets).toEqual(["w1"]);
    expect(control.snapshot()).toEqual({
      state: "loading",
      token: null,
      waiting: false,
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

  it("is unavailable at the deadline while nothing came, and a widget drawn answers for itself", () => {
    const control = createCaptchaControl({
      siteKey: "1x00000000000000000000AA",
      action: "sign-in",
      language: "he",
      page: { scriptFailed: false },
    });
    control.loadTimedOut();
    expect(control.snapshot().state).toBe("unavailable");
    // A script that came late draws a widget all the same.
    const turnstile = fakeTurnstile();
    control.attach(box(), turnstile.api, 340);
    expect(control.snapshot().state).toBe("loading");
    control.loadTimedOut();
    expect(control.snapshot().state).toBe("loading");
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
      expect(demo.snapshot()).toEqual({ state, token: null, waiting: false });
      expect(await demo.take()).toBeUndefined();
      demo.retry();
      expect(demo.snapshot().state).toBe(state);
    }
    expect(createDemoCaptcha("waiting").snapshot()).toEqual({
      state: "loading",
      token: null,
      waiting: true,
    });
  });
});
