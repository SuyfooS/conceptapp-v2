import { avatarHue, initialsOf } from "@domain/people";
import Image from "next/image";
import type { ComponentProps, CSSProperties } from "react";
import { cn } from "./cn";

export type AvatarSize = "sm" | "md" | "xl";

const SIZES: Record<AvatarSize, string> = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  xl: "size-24 text-2xl",
};

/** How wide the photo is drawn, for the browser's choice of source. */
export const AVATAR_PIXELS: Record<AvatarSize, string> = {
  sm: "32px",
  md: "40px",
  xl: "96px",
};

export type AvatarProps = Omit<
  ComponentProps<"span">,
  "children" | "aria-label" | "aria-hidden" | "role"
> & {
  name: string;
  /** A photo to show over the initials; they stay underneath if it fails. */
  photo?: string | null;
  /** 32, 40 or 96 px. */
  size?: AvatarSize;
  /**
   * When the avatar is all a link or button holds, what pressing it does
   * ("הפרופיל שלי"): the avatar is then a picture with that text, and the
   * control takes its name from it. Leave out beside a name, where the
   * avatar is decoration and stays hidden from screen readers.
   */
  label?: string;
};

/**
 * Hidden beside words, or a picture named by what its control does. The
 * initials are a monogram standing in for a photo, not words, so they are
 * never the name.
 */
export function avatarAria(label: string | undefined) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

/**
 * A photo over a decorative circle, as the app shows a stored one: never
 * through the image optimizer, which would keep a private photo under one
 * address for everyone and doesn't pass the viewer's cookies on.
 */
export function AvatarPhoto({
  photo,
  sizes,
  className,
}: {
  photo: string;
  /** How wide it is drawn, such as "40px". */
  sizes: string;
  className?: string;
}) {
  return (
    <Image
      src={photo}
      alt=""
      fill
      unoptimized
      draggable={false}
      sizes={sizes}
      className={cn("rounded-full object-cover", className)}
    />
  );
}

/**
 * A person's photo, or their initials on a soft gradient, the same colour on
 * every screen. The initials stay under the photo, so they show while it
 * loads and if it can't. A control with words beside the avatar takes its
 * name from those words; one that holds only the avatar passes `label`.
 */
export function Avatar({
  name,
  photo,
  size = "md",
  label,
  className,
  ...props
}: AvatarProps) {
  const hue = avatarHue(name);
  return (
    <span
      {...avatarAria(label)}
      className={cn(
        "relative grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-bold text-white",
        SIZES[size],
        className,
      )}
      style={
        {
          background: `linear-gradient(160deg, oklch(0.62 0.1 ${hue}), oklch(0.45 0.1 ${hue}))`,
        } as CSSProperties
      }
      {...props}
    >
      {initialsOf(name)}
      {photo ? <AvatarPhoto photo={photo} sizes={AVATAR_PIXELS[size]} /> : null}
    </span>
  );
}

/** One face in an AvatarStack: a name, and a photo when there is one. */
export type AvatarPerson = { name: string; photo?: string | null };

/** Overlapping avatars, for "who works this shift" at a glance. */
export function AvatarStack({
  people,
  size = "sm",
  max = 4,
  className,
}: {
  people: readonly AvatarPerson[];
  size?: "sm" | "md";
  max?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex", className)}>
      {people.slice(0, max).map((person, i) => (
        <Avatar
          // Names repeat rarely, and the order never changes within a render.
          key={`${person.name}-${i.toString()}`}
          name={person.name}
          photo={person.photo}
          size={size}
          className={cn(
            "shadow-[0_0_0_2px_var(--surface)]",
            i > 0 && "-ms-[7px]",
          )}
        />
      ))}
    </span>
  );
}
