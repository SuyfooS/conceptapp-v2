import { readFileSync } from "node:fs";
import { createElement, type MouseEvent } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { keepTypedFocus, Stepper, type StepperProps, stepped } from "./stepper";

/*
 * The count's minus and plus (accessibility, part 1): a step is kept
 * between its ends, says nothing new at an end, and an end's button dims
 * with aria-disabled, so the focus on it stays, and shows no press while
 * the mouse still finds its tooltip; a view session's stepper is disabled
 * for real. Button dims the same way, and takes no pointer at all.
 */

describe("stepped", () => {
  it("steps by one, kept between its ends", () => {
    expect(stepped("3", 1, 1, 5)).toBe("4");
    expect(stepped("3", -1, 1, 5)).toBe("2");
    expect(stepped("9", -1, 1, 5)).toBe("5");
  });

  it("changes nothing at an end", () => {
    expect(stepped("5", 1, 1, 5)).toBeNull();
    expect(stepped("1", -1, 1, 5)).toBeNull();
  });

  it("steps from nothing in an empty field, and from the least in one it can't read", () => {
    expect(stepped("", 1, 0, 5)).toBe("1");
    expect(stepped("", -1, 1, 5)).toBe("1");
    expect(stepped("-", 1, 2, 5)).toBe("3");
  });
});

function buttons(props: Partial<StepperProps>): string[] {
  const html = renderToString(
    createElement(Stepper, {
      value: "1",
      onValueChange: () => {},
      min: 1,
      max: 3,
      decreaseLabel: "Fewer",
      increaseLabel: "More",
      ...props,
    }),
  );
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("Stepper at its ends", () => {
  it("dims the end's button with aria-disabled, never disabled, so it keeps the focus", () => {
    const [fewer = "", more = ""] = buttons({ value: "1" });
    expect(fewer).toContain('aria-disabled="true"');
    expect(fewer).not.toMatch(/\sdisabled=""/);
    expect(more).not.toContain("aria-disabled=");
    const [, top = ""] = buttons({ value: "3" });
    expect(top).toContain('aria-disabled="true"');
  });

  it("is disabled for real in a view session", () => {
    for (const button of buttons({ value: "2", disabled: true })) {
      expect(button).toMatch(/\sdisabled=""/);
    }
  });

  // Dimmed, it must not spring or darken under a finger as if it had
  // stepped (its onClick ignores the press), and the mouse must still find
  // it, for its tooltip: no pointer-events: none.
  it("gives the end's dimmed button no press to show, and keeps its tooltip", () => {
    const [fewer = ""] = buttons({ value: "1" });
    const classes = fewer.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(fewer).toContain('title="Fewer"');
    expect(classes).not.toContain("aria-disabled:pointer-events-none");
    expect(classes).toContain("aria-disabled:hover:bg-transparent");
    expect(classes).toContain("aria-disabled:active:bg-transparent");
    expect(classes).toContain("aria-disabled:opacity-50");
    expect(classes).toContain("pressable");
    expect(
      readFileSync("app/globals.css", "utf8").replace(/\s+/g, " "),
    ).toContain(
      '@utility pressable { transition: transform 0.3s var(--ease-spring); &:active:not([aria-disabled="true"]) {',
    );
  });

  it("keeps a secondary icon button's own fill when it is dimmed", () => {
    const html = renderToString(
      createElement(IconButton, {
        label: "More",
        icon: null,
        variant: "secondary",
        "aria-disabled": true,
      }),
    );
    const classes =
      html.match(/<button[^>]*class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(classes).toContain("aria-disabled:hover:bg-surface-2");
    expect(classes).toContain("aria-disabled:active:bg-surface-2");
    expect(classes).not.toContain("aria-disabled:pointer-events-none");
  });
});

/** The stepper as drawn: minus, the number, plus, with their handlers. */
function drawn(props: Partial<StepperProps>) {
  const tree = Stepper({
    value: "42",
    onValueChange: () => {},
    min: 4,
    max: 58,
    decreaseLabel: "Fewer",
    increaseLabel: "More",
    ...props,
  });
  type Pressed = {
    props: {
      onClick: () => void;
      onMouseDown?: (event: MouseEvent<HTMLElement>) => void;
    };
  };
  type Typed = {
    props: { onChange: (event: { target: { value: string } }) => void };
  };
  const [fewer, field, more] = tree.props.children as [Pressed, Typed, Pressed];
  return { fewer, field, more };
}

// A setting that saves a press soon after it and what is typed only once it
// is left (the fill's week's hours, filling from availability, part 5) tells
// the two apart: with `onStep`, a press goes there and typing to
// `onValueChange`; without it, both go to `onValueChange`.
describe("Stepper's presses and typing", () => {
  it("sends a press to onStep and typing to onValueChange", () => {
    const typed: string[] = [];
    const pressed: string[] = [];
    const { fewer, field, more } = drawn({
      onValueChange: (value) => {
        typed.push(value);
      },
      onStep: (value) => {
        pressed.push(value);
      },
    });
    more.props.onClick();
    fewer.props.onClick();
    field.props.onChange({ target: { value: "6" } });
    expect(pressed).toEqual(["43", "41"]);
    expect(typed).toEqual(["6"]);
  });

  it("sends both to onValueChange without onStep", () => {
    const typed: string[] = [];
    const { field, more } = drawn({
      onValueChange: (value) => {
        typed.push(value);
      },
    });
    more.props.onClick();
    field.props.onChange({ target: { value: "6" } });
    expect(typed).toEqual(["43", "6"]);
  });

  it("sends nothing for a press at an end", () => {
    const pressed: string[] = [];
    const { more } = drawn({
      value: "58",
      onStep: (value) => {
        pressed.push(value);
      },
    });
    more.props.onClick();
    expect(pressed).toEqual([]);
  });
});

/**
 * A press going down on minus or plus, with the focus in the stepper's own
 * number or elsewhere; says whether it kept the focus where it was.
 */
function pressDown(focus: "number" | "elsewhere"): boolean {
  const number = { tagName: "INPUT" };
  let kept = false;
  const event = {
    currentTarget: {
      parentElement: { querySelector: () => number },
      ownerDocument: { activeElement: focus === "number" ? number : {} },
    },
    preventDefault: () => {
      kept = true;
    },
  };
  keepTypedFocus(event as unknown as MouseEvent<HTMLElement>);
  return kept;
}

// The settings' number (the fill's week's hours, after the third check):
// Enter on 60 keeps it, and the focus, beside its minus. Leaving the field
// with it puts back what's stored, so a press that blurred the field first
// stepped from 42 (41 saved, after "it stays 42"). With `keepsTyping` the
// focus stays in the number, so the press steps from 60, into its ends.
describe("Stepper's press while the number is typed", () => {
  it("keeps the focus in its number, and leaves it alone elsewhere", () => {
    expect(pressDown("number")).toBe(true);
    expect(pressDown("elsewhere")).toBe(false);
  });

  it("holds the focus on both buttons with keepsTyping, and on neither without it", () => {
    const { fewer, more } = drawn({ keepsTyping: true });
    expect(fewer.props.onMouseDown).toBe(keepTypedFocus);
    expect(more.props.onMouseDown).toBe(keepTypedFocus);
    const plain = drawn({});
    expect(plain.fewer.props.onMouseDown).toBeUndefined();
    expect(plain.more.props.onMouseDown).toBeUndefined();
  });

  it("steps from what's typed, into its ends", () => {
    const pressed: string[] = [];
    const { fewer, more } = drawn({
      value: "60",
      keepsTyping: true,
      onStep: (value) => {
        pressed.push(value);
      },
    });
    more.props.onClick();
    fewer.props.onClick();
    expect(pressed).toEqual(["58"]);
  });
});

describe("Button, dimmed with aria-disabled", () => {
  it("takes no press and dims as disabled does, keeping the focus", () => {
    const html = renderToString(
      createElement(Button, { "aria-disabled": true }, "Bring them back"),
    );
    const button = html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled=""/);
    const classes = button.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(classes).toContain("aria-disabled:pointer-events-none");
    expect(classes).toContain("aria-disabled:opacity-50");
  });
});
