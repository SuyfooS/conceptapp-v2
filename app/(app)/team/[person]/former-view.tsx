import type { FormerMember } from "@db/team";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody } from "@ui/page";
import { UserMinus } from "lucide-react";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";

/**
 * `/team/[person]` for someone no longer on the team: their place is kept,
 * inactive, so the page says so instead of "not found", with what stays and
 * how to bring them back. Their name shows only to whoever still reads it
 * (pay holders); everyone else reads "no longer on the team". Also what the
 * page becomes when it is opened again after a removal. Also rendered with
 * mock data on /design/shell/team/[person]?state=former.
 */
export function FormerView({
  former,
  teamHref,
  wording,
}: {
  former: FormerMember;
  /** The Team screen, or the demo's. */
  teamHref: string;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.team");
  const base = t(`roles.${former.role}`);
  // A role the business named by its name, with its base (R11b).
  const formerRole = former.namedRole
    ? t("namedRole", { name: former.namedRole.name, role: base })
    : base;
  return (
    <PageBody className="max-w-3xl">
      <EmptyState
        icon={<UserMinus />}
        title={
          former.name
            ? t("former.named", { name: former.name })
            : t("former.title")
        }
        body={`${t("former.role", { role: formerRole })}. ${t("former.body")}`}
      >
        <Button asChild size="lg">
          <Link href={teamHref}>{t("changes.backToTeam")}</Link>
        </Button>
      </EmptyState>
    </PageBody>
  );
}
