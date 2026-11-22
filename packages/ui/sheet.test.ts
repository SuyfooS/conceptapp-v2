import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SheetProps } from "./sheet";
import { type KeyboardLift, NO_KEYBOARD } from "./use-keyboard-lift";

/*
 * A sheet over the phone's keyboard (Orel, 22 November 2026), drawn: what
 * the keyboard's lift reports is what the sheet stands on. The server draws
 * no portal, so the sheet is drawn in place here, and the lift is given
 * (`use-keyboard-lift.test.ts` reads it from the viewports).
 */

const reported = vi.hoisted(() => ({ lift: null as KeyboardLift | null }));

vi.mock("radix-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("radix-ui")>();
  return {
    ...actual,
    Dialog: {
      ...actual.Dialog,
      Portal: ({ children }: { children: ReactNode }) => children,
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

/** The sheet's own element: the dialog, with its style and classes. */
function drawn(lift: KeyboardLift) {
  reported.lift = lift;
  const props: Omit<SheetProps, "children"> = {
    open: true,
    onOpenChange: () => {},
    title: "Title",
    closeLabel: "Close",
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
  return {
    style: dialog.match(/style="([^"]*)"/)?.[1] ?? null,
    classes: dialog.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [],
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
});
