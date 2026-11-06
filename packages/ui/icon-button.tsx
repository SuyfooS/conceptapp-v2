import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const iconButtonVariants = cva(
  [
    "pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5",
  ],
  {
    variants: {
      variant: {
        ghost: "text-ink hover:bg-surface-2 active:bg-surface-3",
        secondary:
          "bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3",
        glass: "glass text-ink",
      },
      /** Mirror the icon in RTL — for arrows and chevrons that mean "back" or "forward". */
      directional: {
        true: "rtl:[&_svg]:-scale-x-100",
        false: "",
      },
    },
    defaultVariants: { variant: "ghost", directional: false },
  },
);

export type IconButtonProps = Omit<
  ComponentProps<"button">,
  "children" | "aria-label"
> &
  VariantProps<typeof iconButtonVariants> & {
    /** Accessible name, also shown as a tooltip. Required: an icon alone says nothing to a screen reader. */
    label: string;
    icon: ReactNode;
  };

export function IconButton({
  label,
  icon,
  variant,
  directional,
  className,
  type,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, directional }), className)}
      {...props}
    >
      {icon}
    </button>
  );
}
