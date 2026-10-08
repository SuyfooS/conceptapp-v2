import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-medium text-sm",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-ink-2",
        // Text stays ink: an adjusted accent is only guaranteed 3:1, not 4.5:1, against light tints.
        accent:
          "bg-accent-soft text-ink before:size-1.5 before:rounded-full before:bg-accent before:content-['']",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-danger/10 text-danger",
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
