import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2.5 font-semibold text-sm",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-ink-2",
        // Text stays ink: an adjusted accent is only guaranteed 3:1, not 4.5:1, against light tints.
        accent:
          "bg-accent-soft text-ink before:size-1.5 before:rounded-full before:bg-accent before:content-['']",
        success:
          "bg-success-soft text-success before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        warning:
          "bg-warning-soft text-warning before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        danger:
          "bg-danger-soft text-danger before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
