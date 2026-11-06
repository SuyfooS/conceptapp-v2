import { displayIsraeliMobile } from "@domain/phone";
import { brandProps } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Spinner } from "@ui/spinner";
import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { currentMember } from "../(app)/member";
import { currentPlatformRole } from "./staff";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The admin console, for the ConceptApp team only. In ConceptApp's own
// colour rather than a business accent. Who is signed in is read per
// request, so the frame streams in behind a Suspense boundary.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Loading() {
  const t = await getTranslations("app");
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center text-ink-2"
    >
      <Spinner className="size-6" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const [member, role] = await Promise.all([
    currentMember(),
    currentPlatformRole(),
  ]);
  if (!member) redirect("/sign-in");
  const t = await getTranslations("admin");

  // Signed in but not on the team: the console does not exist for them.
  if (!role) {
    return (
      <main className="flex min-h-dvh items-start justify-center px-4 py-10 md:items-center">
        <Card
          tone="raised"
          padding="lg"
          className="flex w-full max-w-[400px] flex-col gap-4"
        >
          <h1 className="font-bold text-xl">{t("noAccess.title")}</h1>
          <p className="text-ink-2">{t("noAccess.body")}</p>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/home">{t("noAccess.home")}</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const nav: NavItem[] = [
    { href: "/admin", label: t("nav.businesses"), icon: <Store /> },
  ];
  const name =
    member.name ?? (member.phone ? displayIsraeliMobile(member.phone) : "");

  return (
    <div {...brandProps}>
      <AppShell
        businessName={t("consoleName")}
        user={{ name, role: t(`roles.${role}`) }}
        nav={nav}
      >
        {children}
      </AppShell>
    </div>
  );
}
