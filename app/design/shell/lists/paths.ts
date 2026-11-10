import type { TemplatePaths } from "../../../(app)/lists/list-types";
import type { ListsPaths } from "../../../(app)/lists/lists-view";
import { baseWording, translator } from "../../../(app)/wording";

/** Lists' links, kept inside the demo. */
export const demoListsPaths: ListsPaths = {
  lists: "/design/shell/lists",
  home: "/design/shell",
  list: (id) => `/design/shell/lists/${id}`,
  base: "/design/shell",
};

/** The template screens' links, kept inside the demo. */
export function demoTemplatePaths(): TemplatePaths {
  const t = translator(baseWording, "app.lists");
  return {
    list: "/design/shell/lists/templates",
    back: { href: demoListsPaths.lists, label: t("title") },
    send: "/design/shell/lists/send",
  };
}
