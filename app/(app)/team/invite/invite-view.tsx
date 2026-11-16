import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import { InviteForm } from "./invite-form";

/**
 * Also rendered on /design/shell/team/invite. With no role to offer (every
 * role the viewer gives holds pay, which only an owner gives; the roles
 * plan's R6), a line saying so and the way back instead of the form.
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
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: teamHref, label: t("title") }}
        title={t("invite.title")}
        subtitle={props.roles.length > 0 ? t("invite.subtitle") : undefined}
      />
      {props.roles.length > 0 ? (
        <InviteForm
          {...props}
          back={{ href: teamHref, label: t("invite.backToTeam") }}
        />
      ) : (
        <Card tone="flat" padding="lg" className="flex flex-col gap-4">
          <CardText>{t("invite.ownerOnly")}</CardText>
          <Button asChild size="lg" variant="secondary" className="md:w-fit">
            <Link href={teamHref}>{t("invite.backToTeam")}</Link>
          </Button>
        </Card>
      )}
    </PageBody>
  );
}
