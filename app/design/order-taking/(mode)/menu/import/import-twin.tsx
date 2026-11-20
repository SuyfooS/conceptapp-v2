"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MenuImportView } from "../../../../../(app)/orders/menu/import/import-view";
import { importMenu } from "../../../changes";
import {
  demoKnownPaste,
  demoPastedMenu,
  demoProblemPaste,
  demoReversedPaste,
} from "../../../data";
import { useOpenedWith } from "../../../demo-store";
import { paths, useOrderWords } from "../../../parts";
import { twinDepartments } from "../../../real-menu";
import { useTwinMenu } from "../menu-twin";

/** What the paste starts with, by `?state=`. */
const PASTES: Record<string, string> = {
  reversed: demoReversedPaste,
  problems: demoProblemPaste,
  known: demoKnownPaste,
};

/**
 * The real import screen on the twin's menu (waiter mode P2): a café's menu
 * pasted, checked against the restaurant's, and added to the twin's store,
 * so the picker on the floor has it. `?state=reversed` has a line a PDF
 * turned around, `?state=problems` lines to fix, `?state=known` items the
 * menu has already.
 */
export function ImportTwin() {
  const { t } = useOrderWords();
  const ti = useTranslations("app.orders.import");
  const opened = useOpenedWith();
  const [paste] = useState(
    (opened ? PASTES[opened] : undefined) ?? demoPastedMenu,
  );
  const { menu, data, update } = useTwinMenu();
  return (
    <MenuImportView
      existing={menu}
      departments={twinDepartments()}
      importMenu={(rows) => {
        const result = importMenu(data, rows);
        update(() => result.data);
        return Promise.resolve({
          ok: true,
          value: { categories: result.categories, items: result.items },
        });
      }}
      paths={{
        back: { href: paths.menu, label: t("nav.menu") },
        // The app's words for it, as /orders/menu/import says it.
        done: { href: paths.menu, label: ti("toMenu") },
        departments: paths.departments,
      }}
      eyebrow={t("mode")}
      initialPaste={paste}
    />
  );
}
