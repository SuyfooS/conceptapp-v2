import type { ListsPaths } from "../../../(app)/lists/lists-view";

/** Lists' links, kept inside the demo. */
export const demoListsPaths: ListsPaths = {
  lists: "/design/shell/lists",
  home: "/design/shell",
  list: (id) => `/design/shell/lists/${id}`,
  base: "/design/shell",
};
