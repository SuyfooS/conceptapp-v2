import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import "@fontsource-variable/heebo";
import { defaultLocale, direction } from "@/i18n/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: {
      default: "ConceptApp",
      template: "%s · ConceptApp",
    },
    description: t("description"),
    applicationName: "ConceptApp",
  };
}

export const viewport: Viewport = {
  themeColor: "#faf8f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Hebrew and RTL by default; copy lives in messages/he.json and
// messages/en.json. Nothing in the UI may assume a direction — use logical
// utilities only (ps-/pe-, ms-/me-, start-/end-, text-start).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      dir={direction(defaultLocale)}
      className="h-full"
    >
      <body className="min-h-full bg-bg text-ink">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
