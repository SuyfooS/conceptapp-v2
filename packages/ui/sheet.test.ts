import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ignoreHeldEnter } from "./focus-after";
import type { SheetProps } from "./sheet";
import { type KeyboardLift, NO_KEYBOARD } from "./use-keyboard-lift";

/*
 * A sheet over the phone's keyboard (Orel, 22 November 2026), drawn: what
 * the keyboard's lift reports is what the sheet stands on. The server draws
 * no portal, so the sheet is drawn in place here, and the lift is given
 * (`use-keyboard-lift.test.ts` reads it from the viewports). Its ✕, where
 * the focus goes as it opens, takes no Enter held down from the press that
 * opened it (accessibility, part 5): its props are noted as it is drawn.
 * Its page kept hidden with it open (left by back or forward), it moves no
 * focus, and keeps what opened it for when it does close (25 November 2026).
 */

const reported = vi.hoisted(() => ({
  lift: null as KeyboardLift | null,
  close: null as Record<string, unknown> | null,
  content: null as Record<string, unknown> | null,
}));

vi.mock("radix-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("radix-ui")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    Dialog: {
      ...actual.Dialog,
      Portal: ({ children }: { children: ReactNode }) => children,
      Close: (props: Parameters<typeof actual.Dialog.Close>[0]) => {
        reported.close = props as Record<string, unknown>;
        return createElement(actual.Dialog.Close, props);
      },
      Content: (props: Parameters<typeof actual.Dialog.Content>[0]) => {
        reported.content = props as Record<string, unknown>;
        return createElement(actual.Dialog.Content, props);
      },
    },
  };
});

vi.mock("./use-keyboard-lift", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-keyboard-lift")>();
  return {
    ...actual,
    useKeyboardLift: () => reported.lift ?? actual.NO_KEYBOARD,
  };
});

const { Sheet } = await import("./sheet");

/**
 * The sheet's own element, the dialog, with its style and classes, and the
 * classes of its body, what holds the field.
 */
function drawn(
  lift: KeyboardLift,
  more: Partial<Omit<SheetProps, "children">> = {},
) {
  reported.lift = lift;
  const props: Omit<SheetProps, "children"> = {
    open: true,
    onOpenChange: () => {},
    title: "Title",
    closeLabel: "Close",
    footer: createElement("button", { type: "button" }, "Save"),
    ...more,
  };
  const html = renderToString(
    createElement(
      Sheet,
      props as SheetProps,
      createElement("input", { "aria-label": "Note" }),
    ),
  );
  const dialog = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0];
  if (!dialog) throw new Error(`no dialog in ${html}`);
  const body = html.match(/<div class="([^"]*)"><input/)?.[1];
  if (!body) throw new Error(`no body in ${html}`);
  return {
    style: dialog.match(/style="([^"]*)"/)?.[1] ?? null,
    classes: dialog.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [],
    body: body.split(" "),
  };
}

describe("Sheet over the keyboard", () => {
  it("stands on the keyboard's lift, within what is on screen", () => {
    expect(drawn({ inset: 336, room: 508 }).style).toBe(
      "--sheet-bottom:344px;--sheet-max:calc(492px - env(safe-area-inset-top))",
    );
  });

  it("carries no style with no keyboard, so it stands where it always did", () => {
    expect(drawn(NO_KEYBOARD).style).toBeNull();
  });

  it("falls back on its place over the safe area, eases the lift, and none with reduced motion", () => {
    const { classes } = drawn(NO_KEYBOARD);
    expect(classes).toContain(
      "bottom-[var(--sheet-bottom,calc(env(safe-area-inset-bottom)+8px))]",
    );
    expect(classes).toContain("max-h-[min(82dvh,var(--sheet-max,82dvh))]");
    expect(classes).toContain("transition-[bottom,max-height]");
    expect(classes).toContain("duration-200");
    expect(classes).toContain("motion-reduce:transition-none");
    // The way in and out stay the transform's.
    expect(classes).toContain(
      "data-[state=open]:animate-[sheet-in_550ms_var(--ease-spring)]",
    );
  });

  it("keeps its header and footer in place and scrolls its body, upright or with no keyboard", () => {
    for (const lift of [NO_KEYBOARD, { inset: 336, room: 508 }]) {
      const { classes, body } = drawn(lift);
      expect(classes).not.toContain("overflow-y-auto");
      expect(body).toContain("min-h-0");
      expect(body).toContain("overflow-y-auto");
      expect(body).not.toContain("shrink-0");
    }
  });

  // Sideways, 114px on screen over the keyboard: kept in place, the header
  // and footer would leave the body no height and the field would vanish.
  it("scrolls whole sideways, its body keeping its height, within what is on screen", () => {
    const { style, classes, body } = drawn({ inset: 230, room: 130 });
    expect(style).toBe(
      "--sheet-bottom:238px;--sheet-max:calc(114px - env(safe-area-inset-top))",
    );
    expect(classes).toContain("overflow-y-auto");
    expect(classes).toContain("overscroll-contain");
    expect(body).toContain("shrink-0");
  });
});

describe("Sheet's close", () => {
  it("lets Enter held down from the press that opened the sheet close nothing", () => {
    drawn(NO_KEYBOARD);
    const close = reported.close;
    expect(close?.["aria-label"]).toBe("Close");
    expect(close?.onKeyDown).toBe(ignoreHeldEnter);
  });
});

describe("Sheet kept hidden with its page", () => {
  // React lets go of a hidden page's effects, so Radix asks where the focus
  // goes, the sheet still drawn (connected) and open.
  it("moves no focus while still drawn, nor chooses where it goes back", () => {
    const returnFocus = vi.fn(() => null);
    drawn(NO_KEYBOARD, { returnFocus });
    const onCloseAutoFocus = reported.content?.onCloseAutoFocus as (event: {
      target: unknown;
      preventDefault(): void;
    }) => void;
    class Drawn {
      isConnected = true;
    }
    vi.stubGlobal("Node", Drawn);
    try {
      const preventDefault = vi.fn();
      onCloseAutoFocus({ target: new Drawn(), preventDefault });
      // Radix's own way (its trigger, else the body) takes nothing either.
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(returnFocus).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
