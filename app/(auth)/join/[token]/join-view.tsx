import { accentTokens } from "@domain/color";
import { phoneEnding } from "@domain/invites";
import type { Role } from "@domain/modules";
import { signInPath } from "@domain/passive-sign-in";
import { accentProps } from "@ui/accent";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { glowClass } from "@ui/page-glow";
import { CircleCheck, Link2Off } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { CenteredScreen } from "@/app/centered-screen";
import { JoinForm } from "./join-form";

type OpenInvite = {
  phone: string;
  role: Role;
  name: string | null;
  business: { name: string; accent: string };
};

/**
 * The first thing a new person sees of the app: the business, in its own
 * colour, with the next step floating over it. One task on every device, so one
 * shape: a column that is the whole screen on a phone and narrow from tablet up.
 * Also rendered with mock data on /design/screens/join.
 */
export async function JoinView({
  invite,
  join,
}: {
  invite: OpenInvite;
  join: ComponentProps<typeof JoinForm>["join"];
}) {
  const t = await getTranslations("auth.join");
  const role = t(`roles.${invite.role}`);
  return (
    <main
      className={cn(
        "flex min-h-dvh flex-col px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-8 md:items-center md:justify-center md:py-16",
        glowClass,
        "md:bg-size-[100%_560px]",
      )}
      {...accentProps(accentTokens(invite.business.accent))}
    >
      <div className="flex w-full flex-col md:max-w-[460px]">
        <Card tone="hero" padding="none" className="px-5 pt-5 pb-[84px]">
          <p className="font-medium text-base">{t("eyebrow")}</p>
          <h1 className="mt-10 text-balance font-bold text-2xl">
            {t("title", { business: invite.business.name })}
          </h1>
          <p className="mt-1 text-base">
            {invite.name
              ? t("welcomeNamed", { name: invite.name, role })
              : t("welcome", { role })}
          </p>
        </Card>
        <Card tone="float" padding="lg" className="relative z-10 mx-3 -mt-16">
          <JoinForm join={join} ending={phoneEnding(invite.phone)} />
        </Card>
      </div>
    </main>
  );
}

/** A link that no longer leads anywhere, and why. */
export async function JoinGoneView({
  reason,
}: {
  reason: "missing" | "expired" | "claimed";
}) {
  const t = await getTranslations("auth.join");
  return (
    <CenteredScreen>
      <EmptyState
        icon={reason === "claimed" ? <CircleCheck /> : <Link2Off />}
        title={t(`gone.${reason}.title`)}
        body={t(`gone.${reason}.body`)}
      >
        {reason === "claimed" ? (
          <Button asChild size="lg">
            <Link href={signInPath}>{t("gone.claimed.signIn")}</Link>
          </Button>
        ) : null}
      </EmptyState>
    </CenteredScreen>
  );
}
