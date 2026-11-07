import { defineManifest } from "@domain/modules";
import { z } from "zod";

/** The business's public page: hours, address, booking link (later phase). */
export const manifest = defineManifest({
  key: "storefront",
  requires: [],
  nav: { href: "/storefront", icon: "store", minRole: "manager", order: 40 },
  homeWidget: null,
  permissions: [{ key: "storefront.edit", defaultRole: "manager" }],
  // Nothing reads these yet: no screen offers them until the module is built.
  settings: z.object({
    /** The public page is visible to everyone. */
    published: z.boolean().default(false).meta({ hidden: true }),
    /** One line under the business's name; the business's own words. */
    tagline: z.string().trim().max(120).default("").meta({ hidden: true }),
  }),
});
