"use client";

import type { Menu } from "@domain/order-taking";
import { useRef, useState } from "react";
import type {
  MenuActions,
  MenuReach,
} from "../../../../(app)/orders/menu/menu-types";
import { MenuView } from "../../../../(app)/orders/menu/menu-view";
import { saveItem, setSoldOut } from "../../changes";
import { demoRemovedDepartment, READER_DEPARTMENTS } from "../../data";
import { type DemoData, useOpenedWith, useOrderDemo } from "../../demo-store";
import { newId } from "../../ids";
import type { MenuItem as TwinItem } from "../../model";
import { paths, useOrderWords } from "../../parts";
import {
  fromItemInput,
  twinDepartments,
  twinMenu,
  twinPlaces,
  withoutDepartment,
} from "../../real-menu";

/** Done: the twin's stand-ins only resolve, as the server's would. */
const done = Promise.resolve({ ok: true as const, value: null });

/**
 * The twin's menu as the real screens read it, at a version that moves with
 * every change to its rows, so a screen takes what it saved back as the app
 * takes the server's.
 */
export function useTwinMenu(): {
  menu: Menu;
  data: DemoData;
  update: ReturnType<typeof useOrderDemo>["update"];
} {
  const { data, update } = useOrderDemo();
  const [seen, setSeen] = useState({
    menu: data.menu,
    soldOut: data.soldOut,
    version: 1,
  });
  if (seen.menu !== data.menu || seen.soldOut !== data.soldOut) {
    setSeen({
      menu: data.menu,
      soldOut: data.soldOut,
      version: seen.version + 1,
    });
  }
  return {
    menu: twinMenu(data, seen.version, twinPlaces(data.tables)),
    data,
    update,
  };
}

/** Shiran, who runs the menu. */
const MANAGER: MenuReach = {
  edits: true,
  runsMenu: true,
  readOnly: null,
  marks: true,
};
/** Yoav in the bar: reads it, and marks sold out what the bar makes. */
const WORKER: MenuReach = {
  edits: false,
  runsMenu: false,
  readOnly: "menu",
  marks: true,
};
/** The team viewing the restaurant as a manager: reads it, changes nothing. */
const VIEWING: MenuReach = {
  edits: false,
  runsMenu: true,
  readOnly: "viewing",
  marks: false,
};

/**
 * The real menu screen on the twin's rows (waiter mode P2), inside the mode's
 * shell, with stand-in actions over the twin's store: what it marks sold out
 * greys the item in the floor's picker too. `?state=worker` is Yoav in the
 * bar, `?state=noRoute` the desserts with their department removed,
 * `?state=viewing` a view as a manager, `?state=noMenu` a business whose
 * menu is still to come.
 */
export function MenuTwin() {
  const { t } = useOrderWords();
  const opened = useOpenedWith();
  const [state] = useState(opened);
  const { menu, update } = useTwinMenu();
  // Removed items wait here for their undo: the twin has no archive.
  const removed = useRef(new Map<string, TwinItem>());
  const noRoute = state === "noRoute";
  const shown = noRoute
    ? withoutDepartment(menu, "desserts", demoRemovedDepartment.id)
    : menu;
  const reach =
    state === "worker" ? WORKER : state === "viewing" ? VIEWING : MANAGER;

  const actions: MenuActions = {
    saveItem: (item) => {
      const id = item.id ?? newId();
      update((d) => saveItem(d, fromItemInput(item, id)));
      return Promise.resolve({ ok: true, value: { id, version: 1 } });
    },
    archiveItem: (id) => {
      update((d) => {
        const item = d.menu.items.find((i) => i.id === id);
        if (item) removed.current.set(id, item);
        return {
          ...d,
          menu: { ...d.menu, items: d.menu.items.filter((i) => i.id !== id) },
        };
      });
      return done;
    },
    restoreItem: (id) => {
      const item = removed.current.get(id);
      if (item) {
        removed.current.delete(id);
        update((d) => saveItem(d, item));
      }
      return done;
    },
    setAvailable: (id, available) => {
      update((d) => setSoldOut(d, id, !available));
      return done;
    },
  };

  return (
    <MenuView
      menu={shown}
      departments={twinDepartments(noRoute ? [demoRemovedDepartment] : [])}
      myDepartments={state === "worker" ? ["bar"] : READER_DEPARTMENTS}
      reach={reach}
      actions={actions}
      paths={{
        back: { href: paths.app, label: t("leave") },
        menu: paths.menu,
        categories: paths.categories,
        places: paths.places,
        import: paths.import,
        departments: paths.departments,
      }}
      eyebrow={t("mode")}
    />
  );
}
