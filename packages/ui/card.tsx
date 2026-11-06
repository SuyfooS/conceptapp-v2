import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Levels, so screens have hierarchy instead of identical blocks:
 * - flat: a soft card on the page, the default
 * - raised: the same; kept so older screens read the same while they move over
 * - float: a card lifted above what is under it, such as a request over the hero
 * - accent: tinted with the business accent, the one thing that needs action now (max one per screen)
 * - hero: filled with the business accent and given depth (max one per screen)
 */
const cardVariants = cva("rounded-card", {
  variants: {
    tone: {
      flat: "bg-surface shadow-card",
      raised: "bg-surface shadow-card",
      float: "bg-surface shadow-float",
      accent: "bg-accent-soft",
      hero: "hero-surface rounded-[32px]",
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

export type CardTitleProps = ComponentProps<"h3"> & {
  /** Heading level. `h2` when the card sits right under the page title. */
  as?: "h2" | "h3";
};

export function CardTitle({
  as: Heading = "h3",
  className,
  ...props
}: CardTitleProps) {
  return (
    <Heading
      className={cn("font-semibold text-md text-ink", className)}
      {...props}
    />
  );
}

export function CardText({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-ink-2", className)} {...props} />;
}
