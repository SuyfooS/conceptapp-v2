import { accentTokens } from "@domain/color";
import { moduleNav } from "@domain/modules";
import { signInPath } from "@domain/passive-sign-in";
import { displayIsraeliMobile } from "@domain/phone";
import { manifests } from "@modules/registry";
import { accentProps } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { AppShellSkeleton } from "@ui/skeleton";
import { House } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { currentPlatformRole } from "../(admin)/staff";
import { signOut } from "../(auth)/actions";
import { currentMember } from "./member";
import { moduleIcons } from "./module-icons";
import { currentModules } from "./modules";
import { NoBusinessScreen } from "./no-business";
import { ViewAsBanner } from "./view-as-banner";

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
  return <AppShellSkeleton label={t("loading")} />;
}

async function Shell({ children }: { children: ReactNode }) {
  const member = await currentMember();
  if (!member) redirect(signInPath);
  const t = await getTranslations("app");

  if (!member.membership) {
    // The ConceptApp team works in the console, not inside a business.
    if (await currentPlatformRole()) redirect("/admin");
    return <NoBusinessScreen signOut={signOut} />;
  }

  const { business, role } = member.membership;
  const enabled = await currentModules();
  const tm = await getTranslations("modules");
  // Home, then one item per enabled module the role reaches.
  const nav: NavItem[] = [
    { href: "/home", label: t("nav.home"), icon: <House />, exact: true },
    ...moduleNav(manifests, enabled, role).map((entry) => ({
      href: entry.href,
      label: tm(`${entry.key}.name`),
      icon: moduleIcons[entry.icon],
    })),
  ];
  const name =
    member.name ?? (member.phone ? displayIsraeliMobile(member.phone) : "");

  return (
    <div {...accentProps(accentTokens(business.accent))}>
      <AppShell
        businessName={business.name}
        user={{ name, role: t(`roles.${role}`) }}
        nav={nav}
      >
        {member.viewing ? (
          <ViewAsBanner viewing={member.viewing} businessName={business.name} />
        ) : null}
        {children}
      </AppShell>
    </div>
  );
}
