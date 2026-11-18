"use client";

import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Lists' department filter, for someone in more than one department: a quiet
 * menu, "כל המחלקות / מטבח / בר", rather than a row of pills. Choosing one
 * opens Lists with that department's lists (`hrefs`, by key); the choice
 * shows at once, and Lists reads as busy until they arrive. The menu is
 * named with what it shows, the new choice included while Lists loads.
 */
export function DepartmentFilter({
  label,
  value,
  options,
  hrefs,
}: {
  /** "מחלקה", beside the menu. */
  label: string;
  value: string;
  options: { key: string; label: string }[];
  hrefs: Record<string, string>;
}) {
  const t = useTranslations("app.lists.filter");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState(value);
  const shown = pending ? picked : value;
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-2 px-1 transition-opacity duration-150 motion-reduce:transition-none",
        pending && "opacity-70",
      )}
    >
      <span aria-hidden="true" className="text-base text-ink-2">
        {label}
      </span>
      <ChoiceMenu
        // The word beside it, then what it shows: a placeholder each, so
        // the name starts with the visible label in any business's wording.
        label={t("menu", { label, name: choiceShown(options, shown) ?? "" })}
        value={shown}
        options={options}
        className="text-base text-ink"
        onChange={(key) => {
          const href = hrefs[key];
          if (!href || key === shown) return;
          setPicked(key);
          start(() => router.push(href));
        }}
      />
    </div>
  );
}
