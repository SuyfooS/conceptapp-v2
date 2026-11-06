import { brandProps } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { Store } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { consoleUser } from "./data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.businesses");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// The console with mock data, in its own frame and colour: it cannot live under
// /design/shell, whose layout is the restaurant's.
export default function ConsoleDemoLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const nav: NavItem[] = [
    { href: "/design/console", label: t("nav.businesses"), icon: <Store /> },
  ];
  return (
    <div {...brandProps}>
      <AppShell
        businessName={t("consoleName")}
        user={{ name: consoleUser.name, role: t("roles.platform_admin") }}
        nav={nav}
      >
        {children}
      </AppShell>
    </div>
  );
}
