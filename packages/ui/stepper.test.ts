import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stepper, type StepperProps, stepped } from "./stepper";

/*
 * The count's minus and plus (accessibility, part 1): a step is kept
 * between its ends, says nothing new at an end, and an end's button dims
 * with aria-disabled, so the focus on it stays; a view session's stepper
 * is disabled for real.
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
});
