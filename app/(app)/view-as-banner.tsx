import type { ViewSession } from "@domain/view-as";
import { Button } from "@ui/button";
import { Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { endViewAsAction } from "./view-as-actions";

/**
 * Above every screen while someone on the ConceptApp team views the
 * business as a role: what they are looking at, that nothing is saved,
 * and the way out.
 */
export async function ViewAsBanner({
  viewing,
  businessName,
}: {
  viewing: ViewSession;
  businessName: string;
}) {
  const [t, tr] = await Promise.all([
    getTranslations("app.viewAs"),
    getTranslations("app.team.roles"),
  ]);
  return (
    <aside
      aria-label={t("label")}
      className="border-line border-b bg-surface-2"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 xl:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <Eye
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-warning"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-medium">
              {t("title", {
                role: tr(viewing.role),
                business: businessName,
              })}
            </p>
            <p className="text-ink-2 text-sm">{t("body")}</p>
          </div>
        </div>
        <form action={endViewAsAction}>
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
