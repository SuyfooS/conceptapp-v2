/*
 * The e2e's stand-in for Cloudflare Turnstile's script. Every spec's browser
 * is served this in place of `challenges.cloudflare.com/turnstile/v0/api.js`
 * (`standInForTurnstile` in e2e/captcha.ts, from the `test` of e2e/test.ts),
 * so no test waits on Cloudflare's network, and a page that draws the "אני
 * לא רובוט" box goes quiet (`networkidle`) as it did before the box: with
 * Cloudflare's own widget and its test key, the file gate's and the bank
 * step's pages never did in CI. Only the tests of Cloudflare's own widget
 * load the real script (`test.use({ turnstile: "cloudflare" })`).
 *
 * It answers as Cloudflare's published test site keys do
 * (developers.cloudflare.com/turnstile/troubleshooting/testing), with their
 * dummy token, always after the call that started the check, as Cloudflare
 * does: a `1x` key (or a real `0x` one) passes; a `2x` key fails with
 * 600010, which a retry may pass; a `3x` key asks for a tick, a checkbox in
 * the widget's place; a key of another shape is refused with 110100. The
 * options the app sets are honoured: each callback, `execution` (on render,
 * or on `execute`), `appearance` (shown always, once its check runs, or only
 * to ask for a tick), `size`, `response-field` and its name; `action`,
 * `cData`, `language` and `theme` are written on the widget for a test to
 * read. An error callback that doesn't answer true is thrown, as Cloudflare
 * throws it. Not modelled: a token's expiry after 300 seconds (no test runs
 * that long), Cloudflare's own retries after a failure (no spec uses the key
 * that fails), and implicit rendering (the app renders explicitly).
 *
 * Plain JavaScript, served as it is; tooling/turnstile-stand-in.test.ts runs
 * it against the app's own `@ui/captcha-control`.
 */
(() => {
  // Loaded twice, the first one's widgets stay, as Cloudflare's do.
  if (window.turnstile) return;

  const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
  const SITE_KEY = /^[0-3]x[0-9A-Za-z_-]{18,30}$/;
  const SIZES = {
    normal: { width: "300px", height: "65px" },
    flexible: { width: "100%", minWidth: "300px", height: "65px" },
    compact: { width: "150px", height: "140px" },
  };
  const widgets = new Map();
  let made = 0;

  /** What a key's check comes to, as Cloudflare's test keys do. */
  const outcomeOf = (sitekey) => {
    if (typeof sitekey !== "string" || !SITE_KEY.test(sitekey)) {
      return "refused";
    }
    if (sitekey.startsWith("2x")) return "fail";
    if (sitekey.startsWith("3x")) return "ask";
    return "pass";
  };

  const call = (widget, name, ...args) => {
    const callback = widget.options[name];
    return typeof callback === "function" ? callback(...args) : undefined;
  };

  /** Shown always, once its check runs (`execute`), or only to ask. */
  const show = (widget) => {
    const appearance = widget.options.appearance ?? "always";
    widget.box.hidden = !(
      appearance === "always" ||
      widget.asking ||
      (appearance === "execute" && widget.started)
    );
  };

  /** The token in the widget's own form field, when it has one. */
  const writeField = (widget) => {
    if (widget.field) widget.field.value = widget.token ?? "";
  };

  /** The check's next step, after the call that started it. */
  const later = (widget, step) => {
    clearTimeout(widget.timer);
    widget.timer = setTimeout(() => {
      widget.timer = undefined;
      step();
    }, 0);
  };

  const pass = (widget) => {
    widget.token = TOKEN;
    writeField(widget);
    call(widget, "callback", TOKEN);
  };

  const fail = (widget, code) => {
    if (call(widget, "error-callback", code) !== true) {
      throw new Error(`[Cloudflare Turnstile] Error: ${code}.`);
    }
  };

  /** A tick asked for: once it is given, the check passes. */
  const ask = (widget) => {
    widget.asking = true;
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.setAttribute("aria-label", "Verify you are human");
    tick.addEventListener("change", () => {
      if (!tick.checked || widgets.get(widget.id) !== widget) return;
      tick.remove();
      widget.asking = false;
      show(widget);
      call(widget, "after-interactive-callback");
      later(widget, () => pass(widget));
    });
    widget.box.append(tick);
    show(widget);
    call(widget, "before-interactive-callback");
  };

  /** The check put back to before it ran: no token, nothing asked. */
  const clear = (widget, started) => {
    clearTimeout(widget.timer);
    widget.timer = undefined;
    widget.token = undefined;
    widget.asking = false;
    widget.started = started;
    widget.box.replaceChildren();
    writeField(widget);
    show(widget);
  };

  /** The check from its start, its answer on the way. */
  const run = (widget) => {
    clear(widget, true);
    later(widget, () => {
      const outcome = outcomeOf(widget.options.sitekey);
      if (outcome === "pass") pass(widget);
      else if (outcome === "ask") ask(widget);
      else fail(widget, outcome === "fail" ? "600010" : "110100");
    });
  };

  /** On render or on reset: its check runs, or waits for `execute`. */
  const begin = (widget) => {
    if ((widget.options.execution ?? "render") === "render") run(widget);
    else clear(widget, false);
  };

  /** A container, as an element or a selector. */
  const placeOf = (target) => {
    if (typeof target !== "string") return target ?? null;
    try {
      return document.querySelector(target);
    } catch {
      return null;
    }
  };

  /** A widget by its id or its container; the first one drawn without. */
  const find = (target) => {
    const all = [...widgets.values()];
    if (target === undefined) return all[0];
    const byId = all.find((widget) => widget.id === target);
    if (byId) return byId;
    const place = placeOf(target);
    return all.find((widget) => place && widget.container === place);
  };

  window.turnstile = {
    render(target, options = {}) {
      const container = placeOf(target);
      if (!container) {
        throw new Error(
          `[Cloudflare Turnstile] Unable to find a container for ${String(target)}.`,
        );
      }
      made += 1;
      const id = `cf-chl-widget-stand-in-${made}`;
      const box = document.createElement("div");
      box.setAttribute("data-turnstile-stand-in", id);
      const written = {
        "data-action": options.action,
        "data-cdata": options.cData,
        "data-language": options.language ?? "auto",
        "data-theme": options.theme ?? "auto",
        "data-size": options.size ?? "normal",
      };
      for (const [name, value] of Object.entries(written)) {
        if (value !== undefined) box.setAttribute(name, String(value));
      }
      Object.assign(box.style, SIZES[options.size] ?? SIZES.normal);
      container.append(box);
      let field;
      if (options["response-field"] !== false) {
        field = document.createElement("input");
        field.type = "hidden";
        field.name = options["response-field-name"] ?? "cf-turnstile-response";
        field.id = `${id}_response`;
        container.append(field);
      }
      const widget = {
        id,
        container,
        options,
        box,
        field,
        token: undefined,
        started: false,
        asking: false,
        timer: undefined,
      };
      widgets.set(id, widget);
      begin(widget);
      return id;
    },
    execute(target, options) {
      const widget = find(target);
      if (!widget) return;
      if (options) widget.options = { ...widget.options, ...options };
      run(widget);
    },
    reset(target) {
      const widget = find(target);
      if (widget) begin(widget);
    },
    remove(target) {
      const widget = find(target);
      if (!widget) return;
      clearTimeout(widget.timer);
      widgets.delete(widget.id);
      widget.box.remove();
      widget.field?.remove();
    },
    getResponse(target) {
      return find(target)?.token;
    },
    // A token here never expires: no test runs Cloudflare's 300 seconds.
    isExpired: () => false,
    ready(callback) {
      callback();
    },
  };

  // `?onload=` names a function of the page's to call once the script is in.
  const src = document.currentScript?.src;
  const onload = src ? new URL(src).searchParams.get("onload") : null;
  if (onload && typeof window[onload] === "function") {
    setTimeout(() => window[onload]());
  }
})();
