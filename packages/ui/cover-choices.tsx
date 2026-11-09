"use client";

import { COVER_PRESETS, type CoverPreset } from "@domain/profile";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cn } from "./cn";
import { ProfileCover } from "./profile-cover";

export type CoverChoicesProps = {
  /** What is being chosen, for screen readers; the sheet's title says it on screen. */
  legend: string;
  /** The chosen cover; null when none is chosen yet. */
  value: CoverPreset | null;
  onChange: (preset: CoverPreset) => void;
  /** The person's avatar hue, for "bloom", as their cover will show it. */
  hue?: number;
  className?: string;
};

/**
 * The eight covers to choose from, each a small picture of itself in the
 * business's colour with its name under it. Real radio buttons: arrows move
 * between them, and the chosen one gets a ring and a tick that springs in.
 * Two columns on phones, four from tablet up.
 */
export function CoverChoices({
  legend,
  value,
  onChange,
  hue,
  className,
}: CoverChoicesProps) {
  const t = useTranslations("ui.profileCover");
  const name = useId();
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {COVER_PRESETS.map((preset) => (
          <label
            key={preset}
            className="group flex cursor-pointer flex-col gap-1.5 text-center font-medium text-ink-2 text-sm has-checked:font-semibold has-checked:text-ink"
          >
            <input
              type="radio"
              name={name}
              value={preset}
              checked={value === preset}
              onChange={() => onChange(preset)}
              className="sr-only"
            />
            <span
              className={cn(
                "pressable relative block aspect-[2.55] rounded-control outline-[2.5px] outline-transparent outline-offset-[3px] transition-[outline-color] duration-200",
                "group-has-checked:outline-ink group-has-focus-visible:outline-accent",
              )}
            >
              <ProfileCover
                preset={preset}
                hue={hue}
                className="absolute inset-0 rounded-control"
              />
              <span
                aria-hidden="true"
                className="absolute start-[7px] top-[7px] grid size-6 scale-60 place-items-center rounded-full bg-surface text-ink opacity-0 shadow-card transition-[opacity,scale] duration-300 ease-spring group-has-checked:scale-100 group-has-checked:opacity-100 [&_svg]:size-4 [&_svg]:stroke-[2.6]"
              >
                <Check />
              </span>
            </span>
            {t(`presets.${preset}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
