import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Three levels, so screens have hierarchy instead of identical blocks:
 * - flat: border only — list rows, secondary content
 * - raised: soft shadow — the primary object on a screen
 * - accent: tinted with the business accent — the one thing that needs action now (max one per screen)
 */
const cardVariants = cva("rounded-card", {
  variants: {
    tone: {
      flat: "border border-line bg-surface",
      raised: "bg-surface shadow-raised",
      accent: "bg-accent-soft",
    },
    padding: {
      none: "",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: { tone: "flat", padding: "md" },
});

export type CardProps = ComponentProps<"div"> &
  VariantProps<typeof cardVariants>;

export function Card({ tone, padding, className, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ tone, padding }), className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3 className={cn("font-bold text-md text-ink", className)} {...props} />
  );
}

export function CardText({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-ink-2", className)} {...props} />;
}
