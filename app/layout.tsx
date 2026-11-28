import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import "@fontsource-variable/heebo";
import { pushConfig } from "@db/push/env";
import { Announcer } from "@ui/announcer";
import { defaultLocale, direction } from "@/i18n/config";
import { installCaptureScript } from "./install-capture";
import { OldBrowser } from "./old-browser";
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
    // On iPhone, "Add to Home Screen" opens it as an app (app/manifest.ts
    // covers the rest).
    appleWebApp: {
      capable: true,
      title: "ConceptApp",
      statusBarStyle: "default",
    },
    icons: { apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeeff2" },
    { media: "(prefers-color-scheme: dark)", color: "#08090b" },
  ],
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
        {/* Before anything else runs: Chrome's offer to install the app,
            which can come before React has drawn the page, is kept for the
            install button's press (app/install-capture.ts). Its own source,
            nothing from outside: a script of the page, read as it loads.
            Chrome's own bar is stopped only where this site can draw the
            button, with notifications to the phone set up (pushConfig, read
            where the page is built or served, so a change takes a
            Redeploy). */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the capture's own source, made on the server from app/install-capture.ts, and a yes or no; nothing a person sent
          dangerouslySetInnerHTML={{
            __html: installCaptureScript(pushConfig() !== null),
          }}
        />
        {/* First of what is drawn, and kept across navigations: a line said
            just before one is heard on the next screen. It has no words of
            its own. */}
        <Announcer />
        {/* At the top of every page of every route group, signed out too,
            and hidden unless the browser is older than the app needs: only
            app/globals.css shows it, with no script. */}
        <OldBrowser />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
