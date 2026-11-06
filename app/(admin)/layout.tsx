import { signInPath } from "@domain/passive-sign-in";
import { displayIsraeliMobile } from "@domain/phone";
import { brandProps } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { Spinner } from "@ui/spinner";
import { Store } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { currentMember } from "../(app)/member";
import { NoAccessScreen } from "./no-access";
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
  if (!member) redirect(signInPath);
  const t = await getTranslations("admin");

  // Signed in but not on the team: the console does not exist for them.
  if (!role) return <NoAccessScreen homeHref="/home" />;

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
