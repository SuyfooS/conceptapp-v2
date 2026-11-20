import {
  type ModeEntry,
  type ModuleKey,
  type ModuleMode,
  moduleModes,
} from "@domain/modules";
import type { OrderMode } from "@domain/orders";
import { manifests } from "@modules/registry";
import { cache } from "react";
import { currentModules } from "./modules";
import { currentOrderMode } from "./orders/order-mode";

/**
 * Where the signed-in person stands in each of the app's modes (P4: waiter
 * mode alone), once per request, for the frame that draws a mode's items and
 * for its ways in (Home, the clock's live shift, the profile). The manifest
 * says the mode and where its ways in show; the module's own read says
 * which items this person gets and where the ways in lead. No screen names
 * a module here by hand.
 */
export type ModeReach = {
  key: ModuleKey;
  href: ModuleMode["href"];
  icon: ModuleMode["icon"];
  entries: readonly ModeEntry[];
  /** The items this person gets, in the manifest's order. */
  items: ModuleMode["items"];
  /** Where its ways in lead: one of its items' paths. */
  entry: string;
  /** Each item's count, by its key, where one needs action. */
  counts: Record<string, number>;
  /** What its ways in say about it. */
  status: ModeStatus;
};

/** What waiter mode's ways in say (`app.orders.home.*`). */
export type ModeStatus = {
  takes: boolean;
  clock: OrderMode["clock"];
  ready: number;
  making: number;
  /** What waits in the departments they prepare for. */
  waiting: OrderMode["waiting"];
};

type ModeRead = () => Promise<{
  items: readonly string[];
  entry: string;
  counts: Record<string, number>;
  status: ModeStatus;
} | null>;

/** Each mode's own read, by its module. */
const READS: Partial<Record<ModuleKey, ModeRead>> = {
  order_taking: async () => {
    const reach = await currentOrderMode();
    if (!reach) return null;
    const { mode } = reach;
    return {
      items: reach.items,
      entry: reach.entry,
      counts: { mine: mode.ready, menu: mode.soldOut },
      status: {
        takes: mode.takes,
        clock: mode.clock,
        ready: mode.ready,
        making: mode.making,
        waiting: mode.waiting,
      },
    };
  },
};

export const currentModes = cache(async (): Promise<ModeReach[]> => {
  const enabled = await currentModules();
  const modes = moduleModes(manifests, enabled);
  const reached = await Promise.all(
    modes.map(async ({ key, mode }): Promise<ModeReach | null> => {
      const read = READS[key];
      const reach = read ? await read() : null;
      if (!reach) return null;
      const items = mode.items.filter((item) => reach.items.includes(item.key));
      const entry = mode.items.find((item) => item.key === reach.entry);
      return {
        key,
        href: mode.href,
        icon: mode.icon,
        entries: mode.entries,
        items,
        entry: entry?.href ?? mode.href,
        counts: reach.counts,
        status: reach.status,
      };
    }),
  );
  return reached.filter((mode): mode is ModeReach => mode !== null);
});
