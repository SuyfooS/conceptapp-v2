"use client";

import { ACCENT_PRESETS, accentTokens } from "@domain/color";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { accentProps } from "./accent";
import { buttonVariants } from "./button";
import { Card } from "./card";
import { cn } from "./cn";

export type AccentPick = "preset" | "custom";

/**
 * A business's colour: eight that always read well, or one of its own from the
 * device's colour picker. `kept` is the colour the screen opened with, offered
 * back while it's open, so trying a preset never loses a colour of its own. When
 * a pick is too light for text on it, the note says it will be darkened.
 */
export function AccentPicker({
  value,
  onPick,
  onCustomDone,
  kept,
  label,
  name = "accentPreset",
  disabled = false,
}: {
  value: string;
  /** A preset, at once; a colour of its own, on every move of the picker. */
  onPick: (hex: string, from: AccentPick) => void;
  /** The device's picker was left. */
  onCustomDone?: () => void;
  kept?: string;
  /** Names the swatches for screen readers, when nothing around them does. */
  label?: string;
  name?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("ui.accentPicker");
  const current = value.toLowerCase();
  const keptHex = kept?.toLowerCase();
  const swatches = [
    ...ACCENT_PRESETS.map((preset) => ({
      hex: preset.hex as string,
      label: t(`presets.${preset.key}`),
    })),
    ...(keptHex && !ACCENT_PRESETS.some((preset) => preset.hex === keptHex)
      ? [{ hex: keptHex, label: t(current === keptHex ? "current" : "kept") }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Two even rows where eight don't fit in one. */}
      <div className="@container rounded-card bg-surface shadow-card">
        <div
          role="radiogroup"
          aria-label={label}
          className="grid grid-cols-4 justify-items-center gap-1.5 p-3 @md:grid-cols-8"
        >
          {swatches.map((swatch) => (
            <label
              key={swatch.hex}
              title={swatch.label}
              className={cn(
                "group grid size-11 place-items-center rounded-full has-checked:shadow-[inset_0_0_0_2px_var(--ink)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
                disabled ? "opacity-60" : "cursor-pointer",
              )}
            >
              <input
                type="radio"
                name={name}
                value={swatch.hex}
                checked={current === swatch.hex}
                disabled={disabled}
                onChange={() => onPick(swatch.hex, "preset")}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="size-[30px] rounded-full transition-transform duration-300 ease-spring group-has-checked:scale-[0.82]"
                style={{ backgroundColor: swatch.hex }}
              />
              <span className="sr-only">{swatch.label}</span>
            </label>
          ))}
        </div>
        <label
          className={cn(
            "relative flex min-h-14 items-center justify-between gap-3 px-4 py-2 before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-line before:content-['']",
            disabled ? "opacity-60" : "cursor-pointer",
          )}
        >
          <span className="font-medium">{t("custom")}</span>
          <input
            type="color"
            value={current}
            disabled={disabled}
            onChange={(event) =>
              onPick(event.target.value.toLowerCase(), "custom")
            }
            onBlur={onCustomDone}
            className="size-9 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 disabled:cursor-default [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
        </label>
      </div>
      {accentTokens(current).adjusted ? (
        <p className="px-1 text-sm" aria-live="polite">
          {t("adjusted")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * How a colour looks in the app before it's saved: a card in the colour with the
 * business's name, and a button over its edge.
 */
export function AccentPreview({
  accent,
  caption,
  title,
  button,
}: {
  accent: string;
  caption: string;
  title: ReactNode;
  button: string;
}) {
  return (
    <div {...accentProps(accentTokens(accent))} className="flex flex-col">
      <Card tone="hero" padding="none" className="px-5 pt-5 pb-[76px]">
        <p className="font-medium text-base">{caption}</p>
        <p className="mt-6 font-bold text-2xl">{title}</p>
      </Card>
      <Card tone="float" padding="md" className="relative z-10 mx-3 -mt-14">
        <span
          className={cn(buttonVariants(), "pointer-events-none flex w-full")}
        >
          {button}
        </span>
      </Card>
    </div>
  );
}
