import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const iconButtonVariants = cva(
  [
    "pressable relative inline-flex size-11 shrink-0 items-center justify-center rounded-full",
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
    /** A link to another screen instead of a button (the bell on Today). */
    href?: string;
    /**
     * A count on the icon, and what it means for a screen reader ("3 new"),
     * which joins the label. Nothing shows at 0.
     */
    badge?: { count: number; label: string };
  };

/** Above this the badge says "99+": a number that long would cover the icon. */
const MOST = 99;

export function IconButton({
  label,
  icon,
  variant,
  directional,
  className,
  type,
  href,
  badge,
  ...props
}: IconButtonProps) {
  const counted = badge && badge.count > 0 ? badge : null;
  const name = counted ? `${label}, ${counted.label}` : label;
  const classes = cn(iconButtonVariants({ variant, directional }), className);
  const content = (
    <>
      {icon}
      {counted ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-accent px-1 text-center font-bold text-[11px] text-accent-ink leading-5 ring-2 ring-bg tabular-nums"
        >
          {counted.count > MOST ? `${MOST}+` : counted.count}
        </span>
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} aria-label={name} title={label} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={type ?? "button"}
      aria-label={name}
      title={label}
      className={classes}
      {...props}
    >
      {content}
    </button>
  );
}
