import { findInvite } from "@db/invites";
import { Spinner } from "@ui/spinner";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { join } from "../actions";
import { JoinGoneView, JoinView } from "./join-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.join");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// The invite is read per request, so it streams in behind a Suspense boundary.
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Loading() {
  const t = await getTranslations("app");
  return (
    <main
      role="status"
      className="flex min-h-dvh items-center justify-center text-ink-2"
    >
      <Spinner className="size-6" />
      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}

async function Invite({
  params,
}: {
  params: PageProps<"/join/[token]">["params"];
}) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (invite?.status !== "open") {
    return <JoinGoneView reason={invite ? invite.status : "missing"} />;
  }
  return <JoinView invite={invite} join={join.bind(null, token)} />;
}
