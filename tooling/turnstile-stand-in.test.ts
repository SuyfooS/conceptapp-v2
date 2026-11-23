import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { TURNSTILE_TEST_KEYS } from "@domain/turnstile";
import {
  type CaptchaControl,
  createCaptchaControl,
  type TurnstileApi,
} from "@ui/captcha-control";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The e2e's stand-in for Cloudflare Turnstile's script
// (e2e/turnstile-stand-in.js), which every spec's browser runs in place of
// Cloudflare's, so no test waits on Cloudflare's network: run here in a
// page of its own against the app's own `@ui/captcha-control`, as a browser
// runs it. Each of Cloudflare's test keys answers as Cloudflare's does, with
// its dummy token, after the call that started the check, and the options
// the app sets are honoured. And the e2e around it: every context a spec
// opens a page in is served it, and only the tests of Cloudflare's own
// widget go without it.

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const STAND_IN = read("e2e/turnstile-stand-in.js");
const SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** An element, as far as the stand-in uses one. */
type FakeNode = {
  attributes: Map<string, string>;
  children: FakeNode[];
  parent: FakeNode | null;
  style: Record<string, string>;
  hidden: boolean;
  type: string;
  name: string;
  id: string;
  value: string;
  checked: boolean;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  append: (...nodes: FakeNode[]) => void;
  remove: () => void;
  replaceChildren: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  /** The test's own: an event as the browser sends it. */
  dispatch: (type: string) => void;
};

function element(): FakeNode {
  const listeners = new Map<string, (() => void)[]>();
  const node: FakeNode = {
    attributes: new Map(),
    children: [],
    parent: null,
    style: {},
    hidden: false,
    type: "",
    name: "",
    id: "",
    value: "",
    checked: false,
    setAttribute: (name, value) => {
      node.attributes.set(name, value);
    },
    getAttribute: (name) => node.attributes.get(name) ?? null,
    append: (...nodes) => {
      for (const child of nodes) {
        child.remove();
        child.parent = node;
        node.children.push(child);
      }
    },
    remove: () => {
      const { parent } = node;
      if (!parent) return;
      parent.children = parent.children.filter((child) => child !== node);
      node.parent = null;
    },
    replaceChildren: () => {
      for (const child of [...node.children]) child.remove();
    },
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    dispatch: (type) => {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
  return node;
}

/** Turnstile's API, as the stand-in gives it to the page. */
type StandIn = {
  render: (target: unknown, options: Record<string, unknown>) => string;
  execute: (target?: unknown, options?: Record<string, unknown>) => void;
  reset: (target?: unknown) => void;
  remove: (target?: unknown) => void;
  getResponse: (target?: unknown) => string | undefined;
  isExpired: (target?: unknown) => boolean;
  ready: (callback: () => void) => void;
};

/** A page the stand-in is loaded in, from `src`, with what it held before. */
function page({
  src = SCRIPT,
  held = {},
}: {
  src?: string;
  held?: Record<string, unknown>;
} = {}) {
  const places = new Map<string, FakeNode>();
  const realm: Record<string, unknown> = {
    ...held,
    document: {
      createElement: element,
      querySelector: (selector: string) => places.get(selector) ?? null,
      currentScript: { src },
    },
    // Read when called, so the test's fake timers count.
    setTimeout: (run: () => void, ms?: number) => setTimeout(run, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    URL,
  };
  realm.window = realm;
  vm.createContext(realm);
  const load = () => vm.runInContext(STAND_IN, realm);
  load();
  /** A container on the page, found by `selector` too when given. */
  const place = (selector?: string) => {
    const node = element();
    if (selector) places.set(selector, node);
    return node;
  };
  return { realm, turnstile: realm.turnstile as StandIn, place, load };
}

/** The app's control on a page with the stand-in, drawn into a place. */
function app(siteKey: string) {
  const { turnstile, place } = page();
  const control = createCaptchaControl({
    siteKey,
    action: "sign-in",
    language: "he",
    page: { scriptFailed: false },
  });
  const container = place();
  const host = container as unknown as HTMLElement;
  control.attach(host, turnstile as unknown as TurnstileApi, 340);
  return { control, container, host, turnstile };
}

const state = (control: CaptchaControl) => control.snapshot().state;
const widgetIn = (container: FakeNode) =>
  container.children.find((child) =>
    child.attributes.has("data-turnstile-stand-in"),
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the stand-in for Cloudflare's script", () => {
  it("gives the page Turnstile's API, and a second load keeps the first's", () => {
    const { realm, turnstile, load } = page();
    for (const name of [
      "render",
      "execute",
      "reset",
      "remove",
      "getResponse",
      "isExpired",
      "ready",
    ] as const) {
      expect(typeof turnstile[name], name).toBe("function");
    }
    load();
    expect(realm.turnstile).toBe(turnstile);
    const ready = vi.fn();
    turnstile.ready(ready);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("calls the page's `onload` once it is in", () => {
    const onload = vi.fn();
    page({ src: `${SCRIPT}&onload=whenIn`, held: { whenIn: onload } });
    expect(onload).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(onload).toHaveBeenCalledOnce();
  });

  it("passes the key that always passes, after the call, with the token the specs look for", () => {
    const { control, container } = app(TURNSTILE_TEST_KEYS.pass);
    expect(state(control)).toBe("loading");
    vi.runAllTimers();
    expect(control.snapshot()).toMatchObject({ state: "ready", token: TOKEN });
    // e2e/captcha.ts's TEST_TOKEN, looked for in each send.
    expect(read("e2e/captcha.ts")).toContain(
      `export const TEST_TOKEN = "${TOKEN}";`,
    );
    // `interaction-only`: nothing shows while nothing is asked.
    expect(widgetIn(container)?.hidden).toBe(true);
  });

  it("starts the next check when a token is spent, as Cloudflare's reset does", async () => {
    const { control, turnstile } = app(TURNSTILE_TEST_KEYS.pass);
    vi.runAllTimers();
    expect(await control.take()).toBe(TOKEN);
    expect(state(control)).toBe("loading");
    expect(turnstile.getResponse()).toBeUndefined();
    vi.runAllTimers();
    expect(state(control)).toBe("ready");
    expect(turnstile.getResponse()).toBe(TOKEN);
    expect(turnstile.isExpired()).toBe(false);
  });

  it("asks for a tick with the key that always asks, and passes once it is given", () => {
    const { control, container } = app(TURNSTILE_TEST_KEYS.tap);
    vi.runAllTimers();
    expect(state(control)).toBe("tap");
    const widget = widgetIn(container);
    expect(widget?.hidden).toBe(false);
    const tick = widget?.children[0];
    if (!tick) throw new Error("no tick drawn");
    expect(tick.type).toBe("checkbox");
    expect(tick.getAttribute("aria-label")).toBeTruthy();
    tick.checked = true;
    tick.dispatch("change");
    // The tick given, its answer on the way.
    expect(state(control)).toBe("loading");
    expect(widget?.hidden).toBe(true);
    expect(widget?.children).toHaveLength(0);
    vi.runAllTimers();
    expect(control.snapshot()).toMatchObject({ state: "ready", token: TOKEN });
  });

  it("fails with the key that always fails, which a retry may pass, and again on the retry", () => {
    const { control } = app(TURNSTILE_TEST_KEYS.fail);
    vi.runAllTimers();
    expect(state(control)).toBe("failed");
    control.retry();
    expect(control.snapshot()).toMatchObject({
      state: "loading",
      retried: true,
    });
    vi.runAllTimers();
    expect(control.snapshot()).toMatchObject({
      state: "failed",
      retried: false,
    });
  });

  it("refuses a key of another shape, as no retry fixes", () => {
    const { control } = app("not-a-site-key");
    vi.runAllTimers();
    expect(state(control)).toBe("unavailable");
  });

  it("throws an error its callback didn't handle, as Cloudflare does", () => {
    const { turnstile, place } = page();
    turnstile.render(place(), {
      sitekey: TURNSTILE_TEST_KEYS.fail,
      "error-callback": () => false,
    });
    expect(() => vi.runAllTimers()).toThrow(
      "[Cloudflare Turnstile] Error: 600010.",
    );
  });

  it("answers no more for a widget removed, and leaves nothing in its place", () => {
    const { control, container, host, turnstile } = app(
      TURNSTILE_TEST_KEYS.pass,
    );
    control.detach(host);
    vi.runAllTimers();
    expect(state(control)).toBe("loading");
    expect(container.children).toEqual([]);
    expect(turnstile.getResponse()).toBeUndefined();
  });

  it("writes the app's options on its widget, sized as Cloudflare sizes it, with no field of its own", () => {
    const { container } = app(TURNSTILE_TEST_KEYS.pass);
    const widget = widgetIn(container);
    expect(Object.fromEntries(widget?.attributes ?? [])).toMatchObject({
      "data-action": "sign-in",
      "data-language": "he",
      "data-theme": "auto",
      "data-size": "flexible",
    });
    expect(widget?.style).toMatchObject({ width: "100%", minWidth: "300px" });
    // "response-field": false: the app posts the token in its own field.
    expect(container.children).toHaveLength(1);

    const { turnstile, place } = page();
    const narrow = place("#narrow");
    turnstile.render("#narrow", {
      sitekey: TURNSTILE_TEST_KEYS.pass,
      size: "compact",
    });
    expect(widgetIn(narrow)?.style).toMatchObject({
      width: "150px",
      height: "140px",
    });
  });

  it("fills a field of its own by default, and shows itself always by default", () => {
    const { turnstile, place } = page();
    const container = place();
    turnstile.render(container, { sitekey: TURNSTILE_TEST_KEYS.pass });
    const field = container.children.find((child) => child.type === "hidden");
    expect(field?.name).toBe("cf-turnstile-response");
    expect(field?.value).toBe("");
    expect(widgetIn(container)?.hidden).toBe(false);
    vi.runAllTimers();
    expect(field?.value).toBe(TOKEN);

    const named = place();
    turnstile.render(named, {
      sitekey: TURNSTILE_TEST_KEYS.pass,
      "response-field-name": "token",
    });
    expect(named.children.some((child) => child.name === "token")).toBe(true);
  });

  it("waits for `execute` when told to, shown from then on with `appearance: execute`", () => {
    const { turnstile, place } = page();
    const container = place();
    const callback = vi.fn();
    const id = turnstile.render(container, {
      sitekey: TURNSTILE_TEST_KEYS.pass,
      execution: "execute",
      appearance: "execute",
      callback,
    });
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
    expect(widgetIn(container)?.hidden).toBe(true);
    turnstile.execute(id);
    expect(widgetIn(container)?.hidden).toBe(false);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledWith(TOKEN);
    // A reset puts it back to waiting.
    turnstile.reset(id);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledOnce();
    expect(widgetIn(container)?.hidden).toBe(true);
  });
});

describe("the e2e around it", () => {
  const e2e = readdirSync(join(root, "e2e"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file: `e2e/${file}`, source: read(`e2e/${file}`) }));

  it("serves it to every context a spec opens a page in", () => {
    // The test's own context has it from e2e/test.ts; a context made for
    // its requests alone (chat-files.spec.ts) opens no page.
    expect(read("e2e/test.ts")).toContain(
      'if (turnstile === "stand-in") await standInForTurnstile(context);',
    );
    const opened: string[] = [];
    for (const { file, source } of e2e) {
      for (const [, name] of source.matchAll(
        /const (\w+) = await browser\.newContext\(/g,
      )) {
        if (!source.includes(`${name}.newPage()`)) continue;
        opened.push(`${file}: ${name}`);
        expect(source, `${file}: ${name}`).toContain(
          `await standInForTurnstile(${name});`,
        );
      }
    }
    expect(opened.length).toBeGreaterThanOrEqual(5);
  });

  it("goes without it only in the tests of Cloudflare's own widget", () => {
    const real = e2e
      .filter(
        ({ file, source }) =>
          file.endsWith(".spec.ts") &&
          source.includes('test.use({ turnstile: "cloudflare" })'),
      )
      .map(({ file }) => file)
      .sort();
    expect(real).toEqual(["e2e/design.spec.ts", "e2e/sign-in.spec.ts"]);
  });
});
