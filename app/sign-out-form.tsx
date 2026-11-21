"use client";

import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { usePlaceWords } from "./(app)/orders/orders-parts";
import {
  clearOrdersOnSignOut,
  ordersPerson,
  type UnsentOnDevice,
  unsentOnDevice,
} from "./(app)/orders/orders-storage";

/**
 * Signs out, and says where the device goes next (the sign-in door, or the
 * clock station's code on a device that is one), or null where nothing is
 * signed in (the design demo's stand-in).
 */
export type SignOutAction = () => Promise<string | null>;

/**
 * A sign-out button's form. Signing out ends with a whole new page where the
 * action says, never a move inside the app: React keeps the screens it drew,
 * and what they hold, across moves and sign-ins alike (cacheComponents keeps
 * them for going back), so on a shared phone the next person would otherwise
 * find the last one's chats, drafts and lists still in the page. The page is
 * loaded here, after the action answers, and not by a screen of the app:
 * signing out draws the signed-out app again at once, which may already be
 * on its way to the door, and takes such a screen with it.
 *
 * What the phone keeps outlives the page, so waiter mode's records of the
 * person (P7: drafts, rounds on their way, the menu) go first, and the page
 * waits for that before it goes. An order of theirs that hasn't gone would
 * go with them, and nothing brings it back: the form asks once, naming
 * where, with "יציאה ומחיקה" and "חזרה" (CLAUDE.md's exception to undo).
 */
export function SignOutForm({
  action,
  className,
  children,
}: {
  action: SignOutAction;
  className?: string;
  /** The button that sends it. */
  children: ReactNode;
}) {
  const t = useTranslations("app.orders.outbox");
  const { placeTitle } = usePlaceWords();
  const form = useRef<HTMLFormElement>(null);
  /** Asked, and "יציאה ומחיקה" pressed: the next submit goes. */
  const sure = useRef(false);
  const [unsent, setUnsent] = useState<UnsentOnDevice | null>(null);
  const count = unsent?.count ?? 1;
  const places = unsent
    ? [...new Set(unsent.places.map((where) => placeTitle(where)))].join(", ")
    : "";

  return (
    <>
      <form
        ref={form}
        action={async () => {
          const person = ordersPerson();
          if (!sure.current && person) {
            const found = await unsentOnDevice(person);
            if (found.count > 0) {
              setUnsent(found);
              return;
            }
          }
          sure.current = false;
          const to = await action();
          if (!to) return;
          await clearOrdersOnSignOut(person);
          window.location.replace(to);
        }}
        className={className}
      >
        {children}
      </form>
      <Sheet
        open={unsent !== null}
        onOpenChange={(open) => {
          if (!open) setUnsent(null);
        }}
        title={t("unsent", { count })}
        subtitle={t("places", { places })}
        closeLabel={t("signOut.back")}
        returnFocus={() =>
          form.current?.querySelector<HTMLElement>("button") ?? null
        }
      >
        <div className="flex flex-col gap-4 px-2 pt-1">
          <p className="text-ink">{t("signOut.body", { count })}</p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button
              variant="danger"
              size="lg"
              className="w-full md:w-auto"
              onClick={() => {
                sure.current = true;
                setUnsent(null);
                form.current?.requestSubmit();
              }}
            >
              {t("signOut.confirm")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full md:w-auto"
              onClick={() => setUnsent(null)}
            >
              {t("signOut.back")}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
