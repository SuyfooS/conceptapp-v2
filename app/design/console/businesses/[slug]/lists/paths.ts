import type { TemplatePaths } from "../../../../../(app)/lists/list-types";
import { baseWording, translator } from "../../../../../(app)/wording";

/** The console's links for one business's templates, kept inside the demo. */
export function consoleTemplatePaths(slug: string): TemplatePaths {
  const t = translator(baseWording, "admin.settings");
  return {
    list: `/design/console/businesses/${slug}/lists`,
    back: {
      href: `/design/console/businesses/${slug}/settings`,
      label: t("title"),
    },
    // The team isn't a member: it sends nothing.
    send: null,
  };
}
