import type { ViewSession } from "@domain/view-as";
import { Button } from "@ui/button";
import { Eye } from "lucide-react";
import { endViewAsAction } from "./view-as-actions";
import { type AppWording, translator } from "./wording";

/**
 * Above every screen while someone on the ConceptApp team views the
 * business as a role: what they are looking at, that nothing is saved,
 * and the way out.
 */
export function ViewAsBanner({
  viewing,
  businessName,
  wording,
  end = endViewAsAction,
}: {
  viewing: ViewSession;
  businessName: string;
  /** The viewed business's words. */
  wording: AppWording;
  /** `endViewAsAction`, or the design demo's stand-in. */
  end?: () => Promise<void>;
}) {
  const t = translator(wording, "app.viewAs");
  const tr = translator(wording, "app.team.roles");
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
            className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-warning-soft text-warning [&_svg]:size-6 [&_svg]:stroke-[1.8]"
          >
            <Eye />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold text-base">
              {t("title", {
                role: tr(viewing.role),
                business: businessName,
              })}
            </p>
            <p className="text-ink-2 text-sm">{t("body")}</p>
          </div>
        </div>
        <form action={end} className="shrink-0">
          <Button
            type="submit"
            variant="secondary"
            className="w-full md:w-auto"
          >
            {t("end")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
