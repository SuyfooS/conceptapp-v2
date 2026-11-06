import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-surface-2 text-ink-2",
} as const;

export type TileProps = {
  href: string;
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
};

/** A count that needs someone's attention, and the way to deal with it. */
export function Tile({
  href,
  icon,
  value,
  label,
  tone = "neutral",
  className,
}: TileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "pressable flex flex-col rounded-card bg-surface p-3.5 text-start shadow-card",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 place-items-center rounded-[13px] [&_svg]:size-6 [&_svg]:stroke-[1.8]",
          tones[tone],
        )}
      >
        {icon}
      </span>
      <span className="mt-3 font-bold text-[28px] leading-[34px]">{value}</span>
      <span className="text-ink-2 text-sm">{label}</span>
    </Link>
  );
}
