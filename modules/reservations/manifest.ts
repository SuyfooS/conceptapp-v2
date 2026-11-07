import { defineManifest } from "@domain/modules";
import { z } from "zod";

/** Table reservations: the day's book and the public booking form (later phase). */
export const manifest = defineManifest({
  key: "reservations",
  requires: [],
  nav: {
    href: "/reservations",
    icon: "utensils",
    minRole: "worker",
    order: 30,
  },
  homeWidget: { minRole: "worker" },
  permissions: [{ key: "reservations.edit", defaultRole: "worker" }],
  // Nothing reads these yet: no screen offers them until the module is built.
  settings: z.object({
    /** Bookable start times are this many minutes apart. */
    slotMinutes: z
      .union([z.literal(15), z.literal(30)])
      .default(30)
      .meta({ hidden: true }),
    /** How long a table is held for one booking. */
    durationMinutes: z
      .int()
      .min(30)
      .max(300)
      .default(90)
      .meta({ hidden: true }),
    /** Larger parties are asked to call. */
    maxPartySize: z.int().min(1).max(50).default(10).meta({ hidden: true }),
  }),
});
