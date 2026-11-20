"use client";

import type { Menu } from "@domain/order-taking";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import type { MenuReach, SavePlaces } from "../menu-types";
import { PlacesEditor } from "./places-editor";

/**
 * The places orders are taken for (waiter mode P2): the business's tables,
 * bar seats or rooms, in the floor's order. For whoever runs the menu; a
 * view as such a role reads them and changes nothing. In the console the
 * team sets them up with the same screen. Also on the twin.
 */
export function PlacesView({
  menu,
  reach,
  save,
  back,
  eyebrow,
}: {
  menu: Pick<Menu, "places" | "version">;
  reach: Pick<MenuReach, "edits" | "readOnly">;
  save: SavePlaces;
  back: { href: string; label: string };
  eyebrow?: string;
}) {
  const t = useTranslations("app.orders.places");
  const tm = useTranslations("app.orders.menu");
  const tn = useTranslations("modules");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={back}
        eyebrow={eyebrow ?? tn("order_taking.name")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {reach.readOnly === "viewing" ? (
        <p className="text-ink-2">{tm("readOnly.viewing")}</p>
      ) : null}
      <PlacesEditor
        places={menu.places}
        disabled={!reach.edits}
        save={save}
        version={menu.version}
      />
    </PageBody>
  );
}
