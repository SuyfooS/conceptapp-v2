import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import { InviteForm } from "./invite-form";

/**
 * Also rendered on /design/shell/team/invite. With no role to offer (every
 * role the viewer gives is an owner's: it holds pay, the roles plan's R6, or
 * more than they hold, R11b), a line saying so and the way back instead of
 * the form: that they see pay when that is why for every one, else that only
 * an owner gives them.
 */
export function TeamInviteView({
  teamHref,
  wording,
  ...props
}: Omit<Parameters<typeof InviteForm>[0], "back"> & {
  teamHref: string;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.team");
  const offered = props.roles.some((choice) => !choice.blocked);
  const forPay = props.roles.every((choice) => choice.blocked === "pay");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: teamHref, label: t("title") }}
        title={t("invite.title")}
        subtitle={offered ? t("invite.subtitle") : undefined}
      />
      {offered ? (
        <InviteForm
          {...props}
          back={{ href: teamHref, label: t("invite.backToTeam") }}
        />
      ) : (
        <Card tone="flat" padding="lg" className="flex flex-col gap-4">
          <CardText>
            {t(forPay ? "invite.ownerOnly" : "invite.ownerOnlyAny")}
          </CardText>
          <Button asChild size="lg" variant="secondary" className="md:w-fit">
            <Link href={teamHref}>{t("invite.backToTeam")}</Link>
          </Button>
        </Card>
      )}
    </PageBody>
  );
}
