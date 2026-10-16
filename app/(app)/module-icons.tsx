import type { ModuleIcon } from "@domain/modules";
import {
  Bell,
  CalendarDays,
  Clock,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import type { ReactNode } from "react";

/** The drawn icon for each icon name a manifest may use. */
export const moduleIcons: Record<ModuleIcon, ReactNode> = {
  calendar: <CalendarDays />,
  clock: <Clock />,
  utensils: <UtensilsCrossed />,
  store: <Store />,
  bell: <Bell />,
};
