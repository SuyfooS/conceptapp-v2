"use client";

import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { usePlaceWords } from "./(app)/orders/orders-parts";
import {
  clearOrdersOnSignOut,
  type UnsentOnDevice,
  unsentToAsk,
} from "./(app)/orders/orders-storage";
import { signOutAndLeave } from "./sign-out";

/** What signing out answers. */
export type SignedOut = {
  /**
   * Where the device goes next (the sign-in door, or the clock station's
   * code on a device that is one); null when it was only asked "who".
   */
  to: string | null;
  /**
   * Whose session it ended (or, asked "who", is), as the server reads it
   * (the session cookie's claim where the auth server can't say): their
   * records on the phone go with it, and nothing else is done by it. Null
   * where nobody was signed in.
   */
  user: string | null;
};

/**
 * Signs out, and says where the device goes next and whose session it
 * ended; with "who", ends nothing and says only whose session it is. Null
 * where nothing is signed in (the design demo's stand-in).
 */
export type SignOutAction = (only?: "who") => Promise<SignedOut | null>;

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
 * Signing out forgets the hiring files' step-up on the server, so every
 * file open on the device, in any tab or window, closes at once (H6a,
 * `signOutAndLeave`). What the phone keeps outlives the page, so waiter
 * mode's records of the person (P7: drafts, rounds on their way, the menu)
 * go first, and the page waits for that before it goes. An order of theirs that hasn't gone would
 * go with them, and nothing brings it back: the form asks once, naming
 * where, with "יציאה ומחיקה" and "חזרה" (CLAUDE.md's exception to undo).
 * Whose they are is the server's word, asked of the action ("who") only
 * when the phone holds any, and answered again as it signs out: never the
 * page's, which knows nobody where no outbox started, and may be another
 * tab's person after the cookie changed under it. The sheet keeps what it
 * asked about while it closes, so its words don't change on the way out.
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
  const [asking, setAsking] = useState(false);
  /** What the question names, kept after it closes. */
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
          if (!sure.current) {
            const found = await unsentToAsk(
              async () => (await action("who"))?.user ?? null,
            );
            if (found) {
              setUnsent(found);
              setAsking(true);
              return;
            }
          }
          sure.current = false;
          await signOutAndLeave(action, {
            win: window,
            clearOrders: clearOrdersOnSignOut,
            go: (to) => window.location.replace(to),
          });
        }}
        className={className}
      >
        {children}
      </form>
      <Sheet
        open={asking}
        onOpenChange={(open) => {
          if (!open) setAsking(false);
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
                setAsking(false);
                form.current?.requestSubmit();
              }}
            >
              {t("signOut.confirm")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full md:w-auto"
              onClick={() => setAsking(false)}
            >
              {t("signOut.back")}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
