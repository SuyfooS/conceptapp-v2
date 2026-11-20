"use client";

import { useState } from "react";
import { CategoriesView } from "../../../../../(app)/orders/menu/categories/categories-view";
import { saveCategories } from "../../../changes";
import { useOpenedWith } from "../../../demo-store";
import { paths, useOrderWords } from "../../../parts";
import { twinDepartments } from "../../../real-menu";
import { useTwinMenu } from "../menu-twin";

/**
 * The real categories screen on the twin's menu (waiter mode P2): renamed,
 * moved, added and removed with an undo, in the twin's store, so the menu
 * and the floor's picker follow. `?state=noDepartments` is a business with
 * no category and no department yet, which the screen sends to the
 * departments first.
 */
export function CategoriesTwin() {
  const { t } = useOrderWords();
  const opened = useOpenedWith();
  const [state] = useState(opened);
  const { menu, data, update } = useTwinMenu();
  const bare = state === "noDepartments";
  return (
    <CategoriesView
      menu={bare ? { ...menu, categories: [], items: [] } : menu}
      departments={bare ? [] : twinDepartments()}
      reach={{ edits: true, runsMenu: true, readOnly: null, marks: true }}
      save={(list) => {
        const saved = saveCategories(data, list);
        update(() => saved.data);
        return Promise.resolve({ ok: true, value: saved.ids });
      }}
      paths={{ menu: paths.menu, departments: paths.departments }}
      eyebrow={t("mode")}
    />
  );
}
