"use client";

import type { PlaceInput } from "@domain/order-taking";
import { useState } from "react";
import { PlacesView } from "../../../../../(app)/orders/menu/places/places-view";
import { useOpenedWith } from "../../../demo-store";
import { newId } from "../../../ids";
import { paths, useOrderWords } from "../../../parts";
import { twinPlaces } from "../../../real-menu";

/**
 * The real places screen on the twin (waiter mode P2): the restaurant's
 * twelve tables, renamed, moved, added and removed with an undo. Kept on this
 * screen alone: the floor's tables stay S0's own. `?state=noPlaces` is a
 * business with none yet, which makes them all at once.
 */
export function PlacesTwin() {
  const { t } = useOrderWords();
  const opened = useOpenedWith();
  const [places, setPlaces] = useState(() =>
    opened === "noPlaces" ? [] : twinPlaces(),
  );
  const [version, setVersion] = useState(1);
  return (
    <PlacesView
      menu={{ places, version }}
      reach={{ edits: true, readOnly: null }}
      save={(list: PlaceInput[]) => {
        const saved = list.map((place) => ({
          id: place.id ?? newId(),
          name: place.name.trim(),
        }));
        setPlaces(saved);
        setVersion((n) => n + 1);
        return Promise.resolve({ ok: true, value: saved.map((p) => p.id) });
      }}
      back={{ href: paths.menu, label: t("nav.menu") }}
      eyebrow={t("mode")}
    />
  );
}
