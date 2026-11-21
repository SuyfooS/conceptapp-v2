"use client";

import type { OrderPlace } from "@domain/order-taking";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { MapPin } from "lucide-react";
import { useOrderWords } from "./orders-parts";

/**
 * "העברה למקום אחר" (waiter mode P5): the free places, in the business's
 * order (`freePlaces`), and one tap moves the order there with everything
 * sent and the phone's draft; the toast's "ביטול" moves it back.
 */
export function MoveSheet({
  open,
  places,
  onClose,
  onPick,
  returnFocus,
}: {
  open: boolean;
  places: readonly OrderPlace[];
  onClose: () => void;
  onPick: (place: OrderPlace) => void;
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const { t, placeTitle } = useOrderWords();
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("order.actions.move")}
      subtitle={t("move.subtitle")}
      closeLabel={t("fix.close")}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-3 px-2 pb-2">
        {places.length === 0 ? (
          <p className="rounded-card bg-elevated px-4 py-3 text-ink-2">
            {t("order.actions.noFree")}
          </p>
        ) : (
          <ListGroup className="bg-elevated shadow-none">
            {places.map((place) => (
              <ListRow
                key={place.id}
                leading={<MapPin />}
                title={placeTitle({ placeName: place.name, takeaway: null })}
                onClick={() => onPick(place)}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </Sheet>
  );
}
