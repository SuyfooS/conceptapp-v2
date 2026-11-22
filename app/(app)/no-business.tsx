import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { Store, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { CenteredScreen } from "@/app/centered-screen";
import { type SignOutAction, SignOutForm } from "@/app/sign-out-form";
import { LostOrdersNotice } from "./orders/outbox-notice";
import { baseWording, translator } from "./wording";

/**
 * Signed in, but no business has added this number yet; or, for someone
 * taken off the team of their last business (`left`, Orel's decision 3 of
 * 14 November 2026: told nothing then), which business they are no longer on
 * the team of, and that a new invite brings them back. Above it, waiter
 * mode's notice of rounds taken off the phone as they left (P7), once.
 * Under it, "עבודות קודמות" (`past`, profile H5c): the businesses they left
 * whose file they can still read, then the way out. Also rendered on
 * /design/screens/no-business.
 */
export async function NoBusinessScreen({
  signOut,
  left = null,
  past = null,
}: {
  /** `signOut`, or the design demo's stand-in. */
  signOut: SignOutAction;
  /** The name of the business they were taken off the team of, the latest. */
  left?: string | null;
  /** "עבודות קודמות", where there is any (`PastJobsSection`). */
  past?: ReactNode;
}) {
  // No business, so no business's words.
  const t = translator(baseWording, "app");
  const out = (
    <SignOutForm action={signOut} className="flex flex-col">
      <Button type="submit" variant="secondary" size="lg">
        {t("signOut")}
      </Button>
    </SignOutForm>
  );
  return (
    <CenteredScreen>
      <div className="flex w-full flex-col items-center gap-6">
        <LostOrdersNotice placement="inline" className="w-full max-w-xl" />
        <EmptyState
          icon={left ? <UserMinus /> : <Store />}
          title={
            left
              ? t("noBusiness.left.title", { business: left })
              : t("noBusiness.title")
          }
          body={left ? t("noBusiness.left.body") : t("noBusiness.body")}
          // The list and the way out follow, in their own places.
          className={past ? "pb-0" : undefined}
        >
          {past ? null : out}
        </EmptyState>
        {past ? (
          <>
            <div className="w-full max-w-xl">{past}</div>
            <div className="flex w-full max-w-xs flex-col">{out}</div>
          </>
        ) : null}
      </div>
    </CenteredScreen>
  );
}
