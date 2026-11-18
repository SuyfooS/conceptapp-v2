import { Button } from "@ui/button";
import { UserMinus } from "lucide-react";
import { seenDepartureAction } from "./business-switch";
import { type AppWording, translator } from "./wording";

/**
 * Above the screen for someone taken off the team of a business who is still
 * in another, whichever was open then (Orel's decision 3 of 14 November
 * 2026): which business they are no longer on the team of, which one is open
 * now, and "הבנתי", which keeps on this device that they saw it, so each is
 * said once (`seenDepartureAction`). Where the view-as banner sits.
 */
export function DepartureNotice({
  business,
  current,
  wording,
  seen = seenDepartureAction,
}: {
  /** The business they were taken off the team of. */
  business: string;
  /** The name of the business open now. */
  current: string;
  /** The words of the business open now. */
  wording: AppWording;
  /** `seenDepartureAction`, or the design demo's stand-in. */
  seen?: () => Promise<void>;
}) {
  const t = translator(wording, "app.departure");
  return (
    <aside
      aria-label={t("label")}
      // No glow on the page under it: it would start in a hard line here.
      className="mx-auto w-full max-w-7xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-6 md:pt-6 xl:px-8 [&+main]:bg-none"
    >
      <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-surface-2 text-ink-2 [&_svg]:size-6 [&_svg]:stroke-[1.8]"
          >
            <UserMinus />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold text-base">
              {t("title", { business })}
            </p>
            <p className="text-ink-2 text-sm">
              {t("body", { business, current })}
            </p>
          </div>
        </div>
        <form action={seen} className="shrink-0">
          <Button
            type="submit"
            variant="secondary"
            className="w-full md:w-auto"
          >
            {t("seen")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
