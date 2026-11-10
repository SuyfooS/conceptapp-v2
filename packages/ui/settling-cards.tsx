import { CircleCheck } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

/** How out of place each card starts, as a share of its own size. */
const PILE = [
  { x: "5%", y: "118%", r: "-7deg" },
  { x: "-6%", y: "62%", r: "5deg" },
  { x: "7%", y: "6%", r: "-3deg" },
  { x: "-4%", y: "-58%", r: "6deg" },
  { x: "3%", y: "-122%", r: "-5deg" },
] as const;

export type SettlingCardsProps = {
  /** What stays beside or above the cards, such as the section's title. */
  head: ReactNode;
  items: { key: string; question: string; answer: string }[];
  className?: string;
};

/**
 * A messy pile of questions that tidies itself into a list as the page
 * scrolls, each card's answer appearing once it has settled. The section stays
 * on screen while that happens, and is an ordinary list when timelines aren't
 * available or the visitor asks for less motion. At most five cards.
 */
export function SettlingCards({ head, items, className }: SettlingCardsProps) {
  return (
    <section className={cn("settle-stage", className)}>
      <div className="settle-pin mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-2 md:gap-12 md:px-8 md:[--spread:1.5]">
        <div className="flex flex-col gap-3">{head}</div>
        <ul className="flex flex-col gap-2.5">
          {items.slice(0, PILE.length).map((item, i) => {
            const place = PILE[i] ?? PILE[0];
            return (
              <li
                key={item.key}
                className="settle-card flex min-h-[4.75rem] items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-float"
                style={
                  {
                    "--i": i,
                    "--x": place.x,
                    "--y": place.y,
                    "--r": place.r,
                  } as CSSProperties
                }
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="settle-question font-semibold text-ink">
                    {item.question}
                  </span>
                  <span className="settle-answer text-base text-ink-2">
                    {item.answer}
                  </span>
                </span>
                <CircleCheck
                  aria-hidden="true"
                  className="settle-answer size-6 shrink-0 text-accent"
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
