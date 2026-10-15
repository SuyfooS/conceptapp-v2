import { accentTokens } from "@domain/color";
import { displayIsraeliMobile } from "@domain/phone";
import { accentStyle } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Spinner } from "@ui/spinner";
import { House } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { signOut } from "../(auth)/actions";
import { currentMember } from "./member";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The signed-in app. Who is signed in is read per request, so the frame
// streams in behind a Suspense boundary (cacheComponents).
export default function AppLayout({ children }: { children: ReactNode }) {
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
  const member = await currentMember();
  if (!member) redirect("/sign-in");
  const t = await getTranslations("app");

  if (!member.membership) {
    return (
      <main className="flex min-h-dvh items-start justify-center px-4 py-10 md:items-center">
        <Card
          tone="raised"
          padding="lg"
          className="flex w-full max-w-[400px] flex-col gap-4"
        >
          <h1 className="font-bold text-xl">{t("noBusiness.title")}</h1>
          <p className="text-ink-2">{t("noBusiness.body")}</p>
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full">
              {t("signOut")}
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  const { business, role } = member.membership;
  const nav: NavItem[] = [
    { href: "/home", label: t("nav.home"), icon: <House />, exact: true },
  ];
  const name =
    member.name ?? (member.phone ? displayIsraeliMobile(member.phone) : "");

  return (
    <div style={accentStyle(accentTokens(business.accent))}>
      <AppShell
        businessName={business.name}
        user={{ name, role: t(`roles.${role}`) }}
        nav={nav}
      >
        {children}
      </AppShell>
    </div>
  );
}
