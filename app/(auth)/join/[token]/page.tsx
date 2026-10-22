import { findInvite, type Invite } from "@db/invites";
import { accentTokens } from "@domain/color";
import { phoneEnding } from "@domain/invites";
import { accentStyle } from "@ui/accent";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Spinner } from "@ui/spinner";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.join");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// One task on every device, like sign-in: a centred card that is the whole
// screen on a phone and a narrow column on tablet and desktop, in the
// accent of the business the link invites to. The invite is read per
// request, so it streams in behind a Suspense boundary.
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 md:items-center md:py-16">
      <Suspense fallback={<Loading />}>
        <InviteCard params={params} />
      </Suspense>
    </main>
  );
}

async function Loading() {
  const t = await getTranslations("app");
  return (
    <div role="status" className="flex items-center justify-center text-ink-2">
      <Spinner className="size-6" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

const card = "flex w-full max-w-[400px] flex-col gap-4 md:p-8";

async function InviteCard({
  params,
}: {
  params: PageProps<"/join/[token]">["params"];
}) {
  const { token } = await params;
  const [invite, t] = await Promise.all([
    findInvite(token),
    getTranslations("auth.join"),
  ]);

  if (invite?.status !== "open") {
    const reason = invite ? invite.status : "missing";
    return (
      <Card tone="raised" padding="lg" className={card}>
        <h1 className="font-bold text-xl md:text-2xl">
          {t(`gone.${reason}.title`)}
        </h1>
        <p className="text-ink-2">{t(`gone.${reason}.body`)}</p>
        {reason === "claimed" ? (
          <Button asChild size="lg">
            <Link href="/sign-in">{t("gone.claimed.signIn")}</Link>
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <div
      className="flex w-full justify-center"
      style={accentStyle(accentTokens(invite.business.accent))}
    >
      <Card tone="raised" padding="lg" className={card}>
        <h1 className="font-bold text-xl md:text-2xl">
          {t("title", { business: invite.business.name })}
        </h1>
        <Welcome t={t} invite={invite} />
        <JoinForm token={token} ending={phoneEnding(invite.phone)} />
      </Card>
    </div>
  );
}

function Welcome({
  t,
  invite,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"auth.join">>>;
  invite: Invite;
}) {
  const role = t(`roles.${invite.role}`);
  return (
    <p>
      {invite.name
        ? t("welcomeNamed", { name: invite.name, role })
        : t("welcome", { role })}
    </p>
  );
}
