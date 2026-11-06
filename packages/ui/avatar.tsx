import { avatarHue, initialsOf } from "@domain/people";
import type { ComponentProps, CSSProperties } from "react";
import { cn } from "./cn";

export type AvatarProps = Omit<ComponentProps<"span">, "children"> & {
  name: string;
  size?: "sm" | "md";
};

/** A person's initials on a soft gradient, the same colour on every screen. */
export function Avatar({
  name,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  const hue = avatarHue(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-white",
        size === "md" ? "size-10 text-sm" : "size-8 text-[11px]",
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
    </span>
  );
}

/** Overlapping avatars, for "who works this shift" at a glance. */
export function AvatarStack({
  names,
  size = "sm",
  max = 4,
  className,
}: {
  names: string[];
  size?: "sm" | "md";
  max?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex", className)}>
      {names.slice(0, max).map((name, i) => (
        <Avatar
          // Names repeat rarely, and the order never changes within a render.
          key={`${name}-${i.toString()}`}
          name={name}
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
