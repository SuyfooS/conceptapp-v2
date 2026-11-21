"use client";

import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { WordingProvider } from "../../(app)/wording-provider";
import { restaurantWording } from "./data";

/**
 * The twin's restaurant reads the real menu screens in its template's
 * sentences ("מצב מלצרות", "מנה", "שולחן"), as the demo restaurant does:
 * Hebrew only, as template wording is.
 */
export function RestaurantWords({ children }: { children: ReactNode }) {
  const locale = useLocale();
  if (locale !== "he") return children;
  return (
    <WordingProvider overrides={restaurantWording}>{children}</WordingProvider>
  );
}
